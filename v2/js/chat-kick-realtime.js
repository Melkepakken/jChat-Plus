(function () {
  window.Chat = window.Chat || {};

  function enabled() {
    return !Chat.info.preview && Chat.isPlatformEnabled("kick");
  }

  function shouldReconnect(code) {
    return code === 3502 || !((code >= 3500 && code < 4000) || (code >= 4500 && code < 5000));
  }

  $.extend(Chat, {
    clearKickReconnectTimer: function () {
      clearTimeout(Chat.info.kickReconnectTimer);
      Chat.info.kickReconnectTimer = null;
    },

    stopKick: function () {
      Chat.info.kickManualClose = true;
      Chat.clearKickReconnectTimer();
      var session = Chat.info.kickSession;
      Chat.info.kickSession = null;
      if (session) session.dispose();
      Chat.info.kickConnectionState = "idle";
    },

    scheduleKickReconnect: function (chatroomId) {
      if (Chat.info.kickManualClose || !enabled()) return;
      Chat.clearKickReconnectTimer();
      var generation = Chat.info.startupGeneration;
      var delay = Math.min(Chat.info.kickReconnectMaxDelay,
        Chat.info.kickReconnectBaseDelay * Math.pow(2, Math.min(10, Chat.info.kickReconnectAttempts)));
      delay += Math.floor(Math.random() * 1000);
      Chat.info.kickReconnectAttempts++;
      Chat.info.kickConnectionState = "retrying";
      console.warn("jChat Kick: Retrying connection discovery in " + Math.round(delay / 1000) + "s.");
      Chat.info.kickReconnectTimer = setTimeout(function () {
        Chat.info.kickReconnectTimer = null;
        if (generation === Chat.info.startupGeneration && enabled() && !Chat.info.kickManualClose) {
          Chat.connectKick(chatroomId, true);
        }
      }, delay);
    },

    connectKick: function (chatroomId, isReconnect) {
      if (!enabled() || !Number.isSafeInteger(chatroomId) || chatroomId <= 0) return;
      if (Chat.info.kickSession) return;
      Chat.clearKickReconnectTimer();
      if (!isReconnect) Chat.info.kickReconnectAttempts = 0;
      Chat.info.kickManualClose = false;
      Chat.info.kickConnectionState = "connecting";
      Chat.info.kickLastError = null;

      var generation = Chat.info.startupGeneration;
      var timers = new Set();
      var requests = new Set();
      var pending = {};
      var nextId = 0;
      var socket = null;
      var provider = null;
      var clientId;
      var heartbeatTimer = null;
      var heartbeatMs = 0;
      var refreshTimer = null;
      var openingTimer = null;
      var subscriptionTimer = null;
      var subscribed = false;
      var wantsPong = false;
      var channel = "chatrooms." + chatroomId + ".v2";
      var session = { dispose: dispose };
      Chat.info.kickSession = session;

      function active() {
        return Chat.info.kickSession === session && generation === Chat.info.startupGeneration && enabled();
      }
      function later(callback, delay) {
        var timer = setTimeout(function () {
          timers.delete(timer);
          if (active()) callback();
        }, delay);
        timers.add(timer);
        return timer;
      }
      function cancel(timer) {
        clearTimeout(timer);
        timers.delete(timer);
      }
      function dispose() {
        timers.forEach(clearTimeout);
        timers.clear();
        requests.forEach(function (request) { request.abort(); });
        requests.clear();
        pending = {};
        if (Chat.info.kickSocket === socket) Chat.info.kickSocket = null;
        if (socket) {
          socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
          socket.close();
        }
      }
      function fail(message, retry) {
        if (!active()) return;
        Chat.info.kickLastError = message;
        console.warn("jChat Kick: " + message);
        Chat.info.kickSession = null;
        dispose();
        Chat.info.kickConnectionState = "error";
        if (retry !== false) Chat.scheduleKickReconnect(chatroomId);
      }
      function request(action, done) {
        var xhr = $.ajax({
          url: "/api/kick/realtime",
          type: "POST",
          contentType: "application/json",
          dataType: "json",
          timeout: 25000,
          data: JSON.stringify({ action: action, clientId: clientId, channelId: Chat.info.kickChannelId || null }),
        });
        requests.add(xhr);
        xhr.done(function (data) {
          requests.delete(xhr);
          if (active()) done(data);
        }).fail(function (response) {
          requests.delete(xhr);
          if (!active()) return;
          if (response.status === 404 || response.status === 405) {
            fail("Kick requires the Pages /api/kick/realtime helper. Run the local Pages runtime when self-hosting.", false);
          } else {
            fail("Could not " + (action === "refresh" ? "renew the guest token" : "discover the connection") +
              " (HTTP " + (response.status || "unavailable") + ").", response.status !== 400 && response.status !== 403);
          }
        });
      }
      function send(packet) {
        if (!active() || !socket || socket.readyState !== WebSocket.OPEN) return false;
        try { socket.send(JSON.stringify(packet)); return true; }
        catch (_) { fail("Could not send a connection command."); return false; }
      }
      function command(name, data, done) {
        var id = ++nextId;
        var packet = { id: id };
        packet[name] = data;
        pending[id] = { name: name, done: done, timer: later(function () {
          fail("Timed out waiting for " + name + " acknowledgement.");
        }, 10000) };
        send(packet);
      }
      function ready() {
        subscribed = true;
        cancel(subscriptionTimer);
        Chat.info.kickReconnectAttempts = 0;
        Chat.info.kickConnectionState = "connected";
        console.log("jChat Kick: Subscribed to " + channel + " via " + provider + ".");
      }
      function heartbeat() {
        cancel(heartbeatTimer);
        if (!heartbeatMs) return;
        heartbeatTimer = later(function () {
          if (provider === "pusher") {
            if (send({ event: "pusher:ping", data: {} })) {
              heartbeatTimer = later(function () { fail("Heartbeat timed out."); }, 10000);
            }
          } else fail("Heartbeat timed out.");
        }, heartbeatMs);
      }
      function renew(result) {
        cancel(refreshTimer);
        if (!result.expires) return;
        if (!Number.isFinite(result.ttl) || result.ttl <= 0) {
          fail("Invalid guest token lifetime.");
          return;
        }
        refreshTimer = later(function () {
          request("refresh", function (data) {
            if (!data || typeof data.token !== "string" || !data.token) {
              fail("Guest token renewal returned no token.");
              return;
            }
            command("refresh", { token: data.token }, renew);
          });
        }, Math.max(1000, (result.ttl - Math.min(60, result.ttl / 2)) * 1000));
      }
      function event(envelope) {
        if (!subscribed || !envelope || typeof envelope.event !== "string") return;
        var data = typeof envelope.data === "string" ? JSON.parse(envelope.data) : envelope.data;
        if (!data || typeof data !== "object") return;
        if (envelope.event === "App\\Events\\ChatMessageEvent") Chat.writeKick(data);
        else if (Chat.isKickDeleteEvent(envelope.event)) Chat.deleteKickMessage(data);
      }
      function centrifugo(packet) {
        if (packet.id) {
          var reply = pending[packet.id];
          if (!reply) return;
          delete pending[packet.id];
          cancel(reply.timer);
          if (packet.error) {
            var code = packet.error.code;
            fail(reply.name + " rejected (code " + code + ").",
              packet.error.temporary === true || code === 109 || code === 110);
          } else if (packet[reply.name] && typeof packet[reply.name] === "object") {
            reply.done(packet[reply.name]);
          } else fail("Malformed " + reply.name + " acknowledgement.");
          return;
        }
        if (!Object.keys(packet).length) {
          if (wantsPong) send({});
          return;
        }
        var push = packet.push;
        if (!push) return;
        if (push.disconnect) {
          var code = push.disconnect.code;
          fail("Server disconnected (code " + code + ").", shouldReconnect(code));
        } else if (push.channel === channel) {
          if (push.unsubscribe) fail("Chat subscription ended (code " + push.unsubscribe.code + ").", push.unsubscribe.code >= 2500);
          else if (push.pub) event(push.pub.data);
        }
      }
      function pusher(packet) {
        if (packet.event === "pusher:connection_established") {
          cancel(openingTimer);
          var data = typeof packet.data === "string" ? JSON.parse(packet.data) : packet.data;
          heartbeatMs = (Number(data.activity_timeout) || 120) * 1000;
          heartbeat();
          send({ event: "pusher:subscribe", data: { auth: "", channel: channel } });
          subscriptionTimer = later(function () { fail("Timed out waiting for subscription acknowledgement."); }, 10000);
        } else if (packet.event === "pusher_internal:subscription_succeeded" && packet.channel === channel) ready();
        else if (packet.event === "pusher:ping") send({ event: "pusher:pong", data: {} });
        else if (packet.event === "pusher:error") {
          var error = typeof packet.data === "string" ? JSON.parse(packet.data) : packet.data;
          fail("Pusher rejected the connection (code " + (error && error.code) + ").");
        } else if (packet.channel === channel) event(packet);
      }

      try {
        clientId = window.crypto.randomUUID();
        request("connect", function (config) {
          if (!config || !["centrifugo", "pusher"].includes(config.provider) ||
              typeof config.url !== "string" ||
              (config.provider === "centrifugo" && !config.token)) {
            fail("Invalid connection configuration from the Kick helper.", false);
            return;
          }
          provider = config.provider;
          var socketUrl = config.url;
          if (provider === "centrifugo") {
            var relay;
            try { relay = new URL(socketUrl, window.location.href); }
            catch (_) { fail("Invalid Kick relay URL.", false); return; }
            if (relay.origin !== window.location.origin || relay.pathname !== "/api/kick/socket") {
              fail("Invalid Kick relay URL.", false);
              return;
            }
            relay.protocol = relay.protocol === "https:" ? "wss:" : "ws:";
            socketUrl = relay.href;
          } else if (!socketUrl.startsWith("wss://")) {
            fail("Invalid Pusher URL.", false);
            return;
          }
          try { socket = new WebSocket(socketUrl); }
          catch (_) { fail("Could not open the Kick WebSocket."); return; }
          Chat.info.kickSocket = socket;
          openingTimer = later(function () { fail("Connection handshake timed out."); }, 15000);
          socket.onopen = function () {
            if (!active()) return;
            if (provider === "centrifugo") {
              cancel(openingTimer);
              command("connect", { token: config.token, name: "js" }, function (result) {
                wantsPong = result.pong === true;
                heartbeatMs = Number.isFinite(result.ping) && result.ping > 0 ? (result.ping + 10) * 1000 : 0;
                heartbeat();
                renew(result);
                if (active()) command("subscribe", { channel: channel }, ready);
              });
              config.token = null;
            }
          };
          socket.onmessage = function (message) {
            if (!active()) return;
            heartbeat();
            String(message.data).split("\n").forEach(function (line) {
              if (!line.trim() || !active()) return;
              try {
                var packet = JSON.parse(line);
                if (!packet || typeof packet !== "object" || Array.isArray(packet)) return;
                if (provider === "centrifugo") centrifugo(packet);
                else pusher(packet);
              } catch (_) {
                console.warn("jChat Kick: Ignored malformed realtime packet.");
              }
            });
          };
          socket.onerror = function () { fail("WebSocket connection failed."); };
          socket.onclose = function (closed) {
            var code = closed.code;
            var retry = provider !== "centrifugo" || shouldReconnect(code);
            fail("WebSocket closed (code " + code + ").", retry);
          };
        });
      } catch (_) {
        fail("Could not initialize the Kick connection. Use HTTPS or localhost.", false);
      }
    },
  });
})();
