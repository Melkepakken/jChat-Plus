(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    getSevenTvBadgeImageUrl: function (badgeId) {
      if (!badgeId) return null;

      return (
        "https://cdn.7tv.app/badge/" +
        encodeURIComponent(String(badgeId)) +
        "/3x.webp"
      );
    },

    sevenTvColorToHex: function (value) {
      if (value === undefined || value === null) return null;

      var color = Number(value);

      if (!Number.isFinite(color)) return null;

      if (color < 0) {
        color = 0xffffffff + color + 1;
      }

      color = color & 0xffffff;

      return "#" + ("000000" + color.toString(16)).slice(-6);
    },

    sevenTvPercent: function (value) {
      var num = Number(value);

      if (!Number.isFinite(num)) {
        return null;
      }

      if (Math.abs(num) <= 1) {
        num = num * 100;
      }

      return Math.round(num * 100) / 100 + "%";
    },

    sevenTvPaintStopsToCss: function (stops) {
      if (!Array.isArray(stops) || !stops.length) {
        return null;
      }

      var cssStops = [];

      stops.forEach(function (stop) {
        if (!stop) return;

        var color = Chat.sevenTvColorToHex(stop.color);

        if (!color) return;

        var position = Chat.sevenTvPercent(stop.at);

        cssStops.push(position ? color + " " + position : color);
      });

      return cssStops.length ? cssStops.join(", ") : null;
    },

    sevenTvPaintShadowToCss: function (shadows) {
      if (!Array.isArray(shadows) || !shadows.length) {
        return null;
      }

      var cssShadows = [];

      shadows.forEach(function (shadow) {
        if (!shadow) return;

        var color = Chat.sevenTvColorToHex(shadow.color);

        if (!color) return;

        cssShadows.push(
          [
            Number(shadow.x_offset) || 0,
            Number(shadow.y_offset) || 0,
            Number(shadow.radius) || 0,
          ].join("px ") +
            "px " +
            color,
        );
      });

      return cssShadows.length ? cssShadows.join(", ") : null;
    },

    sevenTvPaintGradientToCss: function (gradient) {
      if (!gradient) return null;

      var fn = String(gradient.function || "LINEAR_GRADIENT").toUpperCase();

      if (fn === "URL" && gradient.image_url) {
        var url = String(gradient.image_url).replace(/["\\\n\r]/g, "");

        return 'url("' + url + '")';
      }

      var stops = Chat.sevenTvPaintStopsToCss(gradient.stops);

      if (!stops && gradient.color !== undefined && gradient.color !== null) {
        stops = Chat.sevenTvColorToHex(gradient.color);
      }

      if (!stops) return null;

      if (fn === "RADIAL_GRADIENT") {
        var shape = gradient.shape || "circle";
        var at = "";

        if (Array.isArray(gradient.at) && gradient.at.length >= 2) {
          var x = Chat.sevenTvPercent(gradient.at[0]);
          var y = Chat.sevenTvPercent(gradient.at[1]);

          if (x && y) {
            at = " at " + x + " " + y;
          }
        }

        return "radial-gradient(" + shape + at + ", " + stops + ")";
      }

      var angle =
        typeof gradient.angle === "number" && Number.isFinite(gradient.angle)
          ? gradient.angle
          : 90;

      return "linear-gradient(" + angle + "deg, " + stops + ")";
    },

    sevenTvPaintToCss: function (paint) {
      if (!paint) return null;

      var css = {};
      var gradients =
        Array.isArray(paint.gradients) && paint.gradients.length
          ? paint.gradients
          : [paint];

      var backgrounds = [];
      var backgroundRepeat = null;
      var backgroundSize = null;

      gradients.forEach(function (gradient) {
        var background = Chat.sevenTvPaintGradientToCss(gradient);

        if (!background) return;

        backgrounds.push(background);

        if (gradient.canvas_repeat) {
          backgroundRepeat = gradient.canvas_repeat;
        }

        if (
          Array.isArray(gradient.canvas_size) &&
          gradient.canvas_size.length
        ) {
          backgroundSize = gradient.canvas_size
            .map(function (value) {
              return Chat.sevenTvPercent(value) || "100%";
            })
            .join(" ");
        }
      });

      if (backgrounds.length) {
        css["background-image"] = backgrounds.join(", ");
        css["background-size"] = backgroundSize || "100% 100%";
        css["background-repeat"] = backgroundRepeat || "repeat";
        css["background-clip"] = "text";
        css["-webkit-background-clip"] = "text";
        css["color"] = "transparent";
        css["-webkit-text-fill-color"] = "transparent";
      } else if (paint.color !== undefined && paint.color !== null) {
        var color = Chat.sevenTvColorToHex(paint.color);

        if (color) {
          css.color = color;
        }
      } else {
        return null;
      }

      var shadows =
        Chat.sevenTvPaintShadowToCss(paint.shadows) ||
        Chat.sevenTvPaintShadowToCss(paint.text && paint.text.shadows);

      if (shadows) {
        css["text-shadow"] = shadows;
      }

      if (paint.text && paint.text.stroke && paint.text.stroke.color) {
        var strokeColor = Chat.sevenTvColorToHex(paint.text.stroke.color);
        var strokeWidth = Number(paint.text.stroke.width) || 0;

        if (strokeColor && strokeWidth > 0) {
          css["-webkit-text-stroke"] = strokeWidth + "px " + strokeColor;
        }
      }

      if (paint.text && paint.text.transform) {
        css["text-transform"] = paint.text.transform;
      }

      return css;
    },

    sevenTvStyleColorToCss: function (value) {
      if (value === undefined || value === null) {
        return null;
      }

      if (typeof value === "number") {
        return Chat.sevenTvColorToHex(value);
      }

      value = String(value).trim();

      if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) {
        return value;
      }

      if (/^rgb(a)?\(/i.test(value)) {
        return value;
      }

      return null;
    },

    sevenTvStyleColorToCss: function (value) {
      if (value === undefined || value === null) {
        return null;
      }

      if (typeof value === "number") {
        return Chat.sevenTvColorToHex(value);
      }

      value = String(value).trim();

      if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) {
        return value;
      }

      if (/^rgb(a)?\(/i.test(value)) {
        return value;
      }

      return null;
    },

    sevenTvGqlValue: function (value, fallback) {
      if (value && typeof value === "object") {
        if (value.parsedValue !== undefined && value.parsedValue !== null) {
          return Number(value.parsedValue);
        }

        if (value.source !== undefined && value.source !== null) {
          return Number(value.source);
        }
      }

      var number = Number(value);

      return Number.isFinite(number) ? number : fallback;
    },

    sevenTvGqlColorToCss: function (color) {
      if (!color) return null;

      var value = null;

      if (typeof color === "string") {
        value = color;
      } else if (color.hex) {
        value = String(color.hex);
      } else if (color.color !== undefined && color.color !== null) {
        return Chat.sevenTvColorToHex(color.color);
      }

      if (!value) return null;

      value = String(value).trim();

      var match = value.match(/^#([0-9a-f]{8})$/i);

      if (match) {
        var hex = match[1];
        var r = parseInt(hex.slice(0, 2), 16);
        var g = parseInt(hex.slice(2, 4), 16);
        var b = parseInt(hex.slice(4, 6), 16);
        var a = parseInt(hex.slice(6, 8), 16) / 255;

        if (a >= 1) {
          return "#" + hex.slice(0, 6);
        }

        return (
          "rgba(" +
          r +
          ", " +
          g +
          ", " +
          b +
          ", " +
          Math.round(a * 1000) / 1000 +
          ")"
        );
      }

      if (/^#[0-9a-f]{6}$/i.test(value) || /^#[0-9a-f]{3}$/i.test(value)) {
        return value;
      }

      if (/^rgb(a)?\(/i.test(value)) {
        return value;
      }

      return null;
    },

    sevenTvGqlStopToCss: function (stop) {
      if (!stop) return null;

      var color = Chat.sevenTvGqlColorToCss(stop.color);

      if (!color) return null;

      var at = Chat.sevenTvGqlValue(stop.at, null);

      if (at === null || !Number.isFinite(at)) {
        return color;
      }

      if (Math.abs(at) <= 1) {
        at = at * 100;
      }

      return color + " " + Math.round(at * 100) / 100 + "%";
    },

    sevenTvGqlPaintLayerToCss: function (layer) {
      if (!layer || !layer.ty) return null;

      var type = String(layer.ty.__typename || "").toUpperCase();
      var stops = [];

      if (Array.isArray(layer.ty.stops)) {
        stops = layer.ty.stops
          .map(function (stop) {
            return Chat.sevenTvGqlStopToCss(stop);
          })
          .filter(Boolean);
      }

      if (!stops.length) return null;

      if (type.indexOf("RADIAL") !== -1) {
        var radialName = layer.ty.repeating
          ? "repeating-radial-gradient"
          : "radial-gradient";

        return radialName + "(" + stops.join(", ") + ")";
      }

      var linearName = layer.ty.repeating
        ? "repeating-linear-gradient"
        : "linear-gradient";

      var angle = Number(layer.ty.angle);

      if (!Number.isFinite(angle)) {
        angle = 90;
      }

      return linearName + "(" + angle + "deg, " + stops.join(", ") + ")";
    },

    sevenTvGqlPaintShadowsToCss: function (shadows) {
      if (!Array.isArray(shadows) || !shadows.length) {
        return null;
      }

      var filters = [];

      shadows.forEach(function (shadow) {
        if (!shadow) return;

        var color = Chat.sevenTvGqlColorToCss(shadow.color);

        if (!color) return;

        var x = Chat.sevenTvGqlValue(shadow.offsetX, 0);
        var y = Chat.sevenTvGqlValue(shadow.offsetY, 0);
        var blur = Chat.sevenTvGqlValue(shadow.blur, 0);

        filters.push(
          "drop-shadow(" + x + "px " + y + "px " + blur + "px " + color + ")",
        );
      });

      return filters.length ? filters.join(" ") : null;
    },

    sevenTvGqlPaintToCss: function (paint) {
      if (!paint || !paint.data) return null;

      var css = {};
      var backgrounds = [];

      if (Array.isArray(paint.data.layers)) {
        paint.data.layers.forEach(function (layer) {
          var background = Chat.sevenTvGqlPaintLayerToCss(layer);

          if (background) {
            backgrounds.push(background);
          }
        });
      }

      if (backgrounds.length) {
        css["background-image"] = backgrounds.join(", ");
        css["background-size"] = "100% 100%";
        css["background-repeat"] = "repeat";
        css["background-position"] = "center";
        css["background-clip"] = "text";
        css["-webkit-background-clip"] = "text";
        css["color"] = "transparent";
        css["-webkit-text-fill-color"] = "transparent";

        /*
         * 7TV paints are their own text effect.
         * If the overlay stroke/shadow remains active on transparent painted text,
         * the black stroke can overpower the gradient and make the name look black.
         */
        css["-webkit-text-stroke"] = "0";
        css["text-shadow"] = "none";
      }

      var shadowFilter = Chat.sevenTvGqlPaintShadowsToCss(paint.data.shadows);

      if (shadowFilter) {
        css["filter"] = shadowFilter;
      }

      return Object.keys(css).length ? css : null;
    },

    getSevenTvUserFromResponse: function (res) {
      if (!res) return null;

      if (res.data && res.data.users) {
        if (
          Object.prototype.hasOwnProperty.call(
            res.data.users,
            "userByConnection",
          )
        ) {
          return res.data.users.userByConnection;
        }

        if (Object.prototype.hasOwnProperty.call(res.data.users, "user")) {
          return res.data.users.user;
        }
      }

      return (
        res.user ||
        (res.id || res.style || res.badge || res.paint ? res : null)
      );
    },

    extractSevenTvActivePaint: function (res) {
      if (!res) return null;

      var user = Chat.getSevenTvUserFromResponse(res);

      if (!user) return null;

      var style = user.style || res.style || {};
      var paint = style.activePaint || null;

      if (!paint) return null;

      var css = Chat.sevenTvGqlPaintToCss(paint);

      if (!css) return null;

      return {
        id: paint.id || style.activePaintId || null,
        name: paint.name || "7TV Name Paint",
        css: css,
      };
    },

    getSevenTvUserIdFromResponse: function (res) {
      var user = Chat.getSevenTvUserFromResponse(res);

      if (!user) return null;

      return user.id || res.user_id || res.userId || res.id || null;
    },

    requestSevenTvUserByTwitchId: function (userId, includeBadge, includePaint) {
      var request = $.Deferred();

      userId = String(userId || "");

      if (!/^\d+$/.test(userId) || (!includeBadge && !includePaint)) {
        request.reject({
          kind: "invalid",
        });
        return request.promise();
      }

      var styleFields = [];

      if (includePaint) {
        styleFields.push(
          "activePaintId",
          "activePaint {" +
            " id" +
            " name" +
            " data {" +
            "   layers {" +
            "     id" +
            "     opacity" +
            "     ty {" +
            "       __typename" +
            "       ... on PaintLayerTypeLinearGradient {" +
            "         angle" +
            "         repeating" +
            "         stops { at color { hex } }" +
            "       }" +
            "       ... on PaintLayerTypeRadialGradient {" +
            "         repeating" +
            "         stops { at color { hex } }" +
            "       }" +
            "     }" +
            "   }" +
            "   shadows { color { hex } offsetX offsetY blur }" +
            " }" +
            "}",
        );
      }

      if (includeBadge) {
        styleFields.push(
          "activeBadgeId",
          "activeBadge {" +
            " id" +
            " name" +
            " description" +
            " images { url mime scale width height }" +
            "}",
        );
      }

      var query =
        "query jChatPlusSevenTvUserByConnection($platformId: String!) {" +
        "  users {" +
        "    userByConnection(platform: TWITCH, platformId: $platformId) {" +
        "      id" +
        "      style {" +
        styleFields.join(" ") +
        "      }" +
        "    }" +
        "  }" +
        "}";

      $.ajax({
        url: "https://api.7tv.app/v4/gql",
        type: "POST",
        method: "POST",
        dataType: "json",
        contentType: "application/json",
        processData: false,
        data: JSON.stringify({
          operationName: "jChatPlusSevenTvUserByConnection",
          query: query,
          variables: {
            platformId: userId,
          },
        }),
      })
        .done(function (res) {
          if (res && Array.isArray(res.errors) && res.errors.length) {
            request.reject({
              kind: "graphql",
              details: res.errors,
            });
            return;
          }

          var users = res && res.data ? res.data.users : null;

          if (
            !users ||
            !Object.prototype.hasOwnProperty.call(users, "userByConnection")
          ) {
            request.reject({
              kind: "malformed",
              details: res,
            });
            return;
          }

          request.resolve(res);
        })
        .fail(function (xhr) {
          request.reject({
            kind: "http",
            status: xhr && xhr.status,
            details: xhr && xhr.responseText,
          });
        });

      return request.promise();
    },

    extractSevenTvPaint: function (res) {
      if (!res) return null;

      var activePaint = Chat.extractSevenTvActivePaint(res);

      if (activePaint) {
        return activePaint;
      }

      var user = Chat.getSevenTvUserFromResponse(res) || res;
      var style = user.style || res.style || {};

      var paint =
        style.paint ||
        user.paint ||
        res.paint ||
        (res.id &&
        (res.gradients ||
          res.color !== undefined ||
          res.image_url ||
          res.function ||
          res.stops)
          ? res
          : null);

      if (paint) {
        var css = Chat.sevenTvPaintToCss(paint);

        if (css) {
          return {
            id:
              paint.id ||
              style.paint_id ||
              style.paintId ||
              style.activePaintId ||
              user.paint_id ||
              user.paintId ||
              res.paint_id ||
              res.paintId ||
              null,
            name: paint.name || "7TV Name Paint",
            css: css,
          };
        }
      }

      var styleColor = Chat.sevenTvStyleColorToCss(
        style.color || user.color || res.color,
      );

      if (styleColor) {
        return {
          id:
            style.paint_id ||
            style.paintId ||
            style.activePaintId ||
            user.paint_id ||
            user.paintId ||
            res.paint_id ||
            res.paintId ||
            null,
          name: "7TV Name Color",
          css: {
            color: styleColor,
          },
        };
      }

      return null;
    },

    extractSevenTvPaintId: function (res) {
      if (!res) return null;

      var user = res.user || res;
      var style = user.style || res.style || {};
      var paint = style.paint || user.paint || res.paint || null;

      if (paint && paint.id) {
        return paint.id;
      }

      return (
        style.paint_id ||
        style.paintId ||
        user.paint_id ||
        user.paintId ||
        res.paint_id ||
        res.paintId ||
        null
      );
    },

    getSevenTvUserIdFromResponse: function (res) {
      var user = Chat.getSevenTvUserFromResponse(res);

      if (!user) return null;

      return user.id || res.user_id || res.userId || res.id || null;
    },

    shouldLoadSevenTvNamePaint: function (userId) {
      if (!Chat.info.seventvNamePaints || Chat.info.nicknameColor) {
        return false;
      }

      userId = String(userId || "");

      if (!/^\d+$/.test(userId)) {
        return false;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          Chat.info.seventvPaintCache,
          userId,
        )
      ) {
        return false;
      }

      if (Chat.info.seventvBadgeRequests[userId]) {
        return false;
      }

      return true;
    },

    applySevenTvNamePaint: function ($username, userId) {
      if (!Chat.info.seventvNamePaints || Chat.info.nicknameColor) {
        return false;
      }

      userId = String(userId || "");

      if (!/^\d+$/.test(userId)) {
        return false;
      }

      var paint = Chat.info.seventvPaintCache[userId];

      if (!paint || !paint.css) {
        return false;
      }

      $username.addClass("seventv_name_paint");
      $username.attr("title", paint.name || "7TV Name Paint");

      Object.entries(paint.css).forEach(function (entry) {
        $username.css(entry[0], entry[1]);
      });

      return true;
    },

    extractSevenTvBadge: function (res) {
      if (!res) return null;

      var user = Chat.getSevenTvUserFromResponse(res);

      if (!user) return null;

      var style = user.style || res.style || {};
      var badge =
        style.activeBadge || style.badge || user.badge || res.badge || null;

      if (badge && badge.id) {
        var imageUrl = null;

        if (Array.isArray(badge.images) && badge.images.length) {
          var image =
            badge.images.find(function (item) {
              return item && item.mime === "image/webp" && item.scale === 3;
            }) ||
            badge.images.find(function (item) {
              return item && item.mime === "image/webp";
            }) ||
            badge.images.find(function (item) {
              return item && item.url;
            });

          if (image && image.url) {
            imageUrl = image.url;
          }
        }

        if (
          !imageUrl &&
          badge.host &&
          badge.host.url &&
          Array.isArray(badge.host.files)
        ) {
          var file =
            badge.host.files.find(function (item) {
              return item && item.name && item.name.indexOf("3x") !== -1;
            }) || badge.host.files[badge.host.files.length - 1];

          if (file && file.name) {
            imageUrl = badge.host.url + "/" + file.name;
          }
        }

        return {
          description:
            badge.description ||
            badge.tooltip ||
            badge.name ||
            badge.title ||
            "7TV Badge",
          url:
            badge.image_url ||
            badge.image ||
            badge.url ||
            imageUrl ||
            Chat.getSevenTvBadgeImageUrl(badge.id),
        };
      }

      var badgeId =
        style.activeBadgeId ||
        style.badge_id ||
        style.badgeId ||
        user.badge_id ||
        user.badgeId ||
        res.badge_id ||
        res.badgeId;

      if (!badgeId) return null;

      return {
        description: "7TV Badge",
        url: Chat.getSevenTvBadgeImageUrl(badgeId),
      };
    },

    warnSevenTvUserLookupOnce: function (kind, message, details) {
      if (Chat.info.seventvBadgeWarnings[kind]) return;

      Chat.info.seventvBadgeWarnings[kind] = true;
      console.warn("jChat 7TV cosmetics: " + message, details || "");
    },

    updateRenderedSevenTvCosmetics: function (userId, badge, paint) {
      userId = String(userId || "");

      var $lines = $(".chat_line").filter(function () {
        return $(this).attr("data-user-id") === userId;
      });

      $lines.each(function () {
        var $username = $(this).find(".user_info .nick").first();

        if (!$username.length) return;

        if (paint) {
          Chat.applySevenTvNamePaint($username, userId);
        }

        if (badge && !Chat.info.hideBadges && !Chat.info.hideAllBadges) {
          var $userInfo = $username.closest(".user_info");
          var hasBadge = $userInfo.find("img.badge").filter(function () {
            return $(this).attr("src") === badge.url;
          }).length;

          if (!hasBadge) {
            var $badge = Chat.appendChatBadge($userInfo, badge);

            if ($badge) {
              $badge.attr("data-seventv-user-badge", userId);
              $badge.insertBefore($username);
            }
          }
        }
      });

      return $lines.length;
    },

    drainSevenTvUserBadgeQueue: function () {
      var concurrency = Math.max(
        1,
        Number(Chat.info.seventvBadgeRequestLimit) || 3,
      );

      while (
        Chat.info.seventvBadgeActiveRequests < concurrency &&
        Chat.info.seventvBadgeQueue.length
      ) {
        var task = Chat.info.seventvBadgeQueue.shift();

        Chat.info.seventvBadgeActiveRequests++;

        (function (currentTask) {
          function finish(badge, paint) {
            if (currentTask.includeBadge) {
              Chat.info.seventvBadgeCache[currentTask.userId] = badge || null;
            }

            if (currentTask.includePaint) {
              Chat.info.seventvPaintCache[currentTask.userId] = paint || null;
            }

            if (badge) {
              Chat.addUserBadge(currentTask.nick, badge);
            }

            if (
              (badge || paint) &&
              !Chat.updateRenderedSevenTvCosmetics(
                currentTask.userId,
                badge,
                paint,
              )
            ) {
              window.setTimeout(function () {
                Chat.updateRenderedSevenTvCosmetics(
                  currentTask.userId,
                  badge,
                  paint,
                );
              }, 400);
            }

            currentTask.request.resolve();
          }

          Chat.requestSevenTvUserByTwitchId(
            currentTask.userId,
            currentTask.includeBadge,
            currentTask.includePaint,
          )
            .done(function (res) {
              var user = Chat.getSevenTvUserFromResponse(res);

              if (!user) {
                finish(null, null);
                return;
              }

              finish(
                currentTask.includeBadge
                  ? Chat.extractSevenTvBadge(res)
                  : null,
                currentTask.includePaint
                  ? Chat.extractSevenTvPaint(res)
                  : null,
              );
            })
            .fail(function (error) {
              Chat.warnSevenTvUserLookupOnce(
                "service",
                "lookup failed; cosmetics are disabled for affected users this session.",
                error,
              );
              finish(null, null);
            })
            .always(function () {
              Chat.info.seventvBadgeActiveRequests = Math.max(
                0,
                Chat.info.seventvBadgeActiveRequests - 1,
              );
              delete Chat.info.seventvBadgeRequests[currentTask.userId];
              Chat.drainSevenTvUserBadgeQueue();
            });
        })(task);
      }
    },

    loadSevenTvUserBadge: function (nick, userId) {
      var resolved = $.Deferred().resolve().promise();

      if (!nick || !userId) {
        return resolved;
      }

      userId = String(userId);

      var includeBadge = !Chat.info.hideBadges && !Chat.info.hideAllBadges;
      var includePaint =
        Chat.info.seventvNamePaints && !Chat.info.nicknameColor;

      if (!/^\d+$/.test(userId) || (!includeBadge && !includePaint)) {
        return resolved;
      }

      var hasBadgeCache = Object.prototype.hasOwnProperty.call(
        Chat.info.seventvBadgeCache,
        userId,
      );

      var hasPaintCache = Object.prototype.hasOwnProperty.call(
        Chat.info.seventvPaintCache,
        userId,
      );

      if (
        (!includeBadge || hasBadgeCache) &&
        (!includePaint || hasPaintCache)
      ) {
        var cachedBadge = Chat.info.seventvBadgeCache[userId];

        if (includeBadge && cachedBadge) {
          Chat.addUserBadge(nick, cachedBadge);
        }

        return resolved;
      }

      if (Chat.info.seventvBadgeRequests[userId]) {
        return Chat.info.seventvBadgeRequests[userId].done(function () {
          var cachedBadge = Chat.info.seventvBadgeCache[userId];

          if (includeBadge && cachedBadge) {
            Chat.addUserBadge(nick, cachedBadge);
          }
        });
      }

      var request = $.Deferred();

      Chat.info.seventvBadgeRequests[userId] = request.promise();

      if (
        Chat.info.seventvBadgeQueue.length >=
        Chat.info.seventvBadgeQueueLimit
      ) {
        if (includeBadge) {
          Chat.info.seventvBadgeCache[userId] = null;
        }

        if (includePaint) {
          Chat.info.seventvPaintCache[userId] = null;
        }

        delete Chat.info.seventvBadgeRequests[userId];
        request.resolve();
        Chat.warnSevenTvUserLookupOnce(
          "queue",
          "lookup queue reached its limit; excess cosmetics were skipped.",
        );
        return request.promise();
      }

      Chat.info.seventvBadgeQueue.push({
        nick: nick,
        userId: userId,
        includeBadge: includeBadge,
        includePaint: includePaint,
        request: request,
      });

      Chat.drainSevenTvUserBadgeQueue();

      return request.promise();
    },
  });
})();
