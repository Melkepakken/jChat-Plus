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

    extractSevenTvActivePaint: function (res) {
      if (!res) return null;

      var user =
        res.data && res.data.users && res.data.users.user
          ? res.data.users.user
          : res.user || res;

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
      if (!res) return null;

      var user = res.user || res;

      return user.id || res.user_id || res.userId || res.id || null;
    },

    loadSevenTvUserStyleV4: function (sevenTvUserId) {
      var request = $.Deferred();

      sevenTvUserId = String(sevenTvUserId || "");

      if (!/^[0-9A-Z]+$/i.test(sevenTvUserId)) {
        request.resolve(null);
        return request.promise();
      }

      var query =
        "query jChatPlusSevenTvUserStyle($id: Id!) {" +
        "  users {" +
        "    user(id: $id) {" +
        "      id" +
        "      style {" +
        "        activePaintId" +
        "        activePaint {" +
        "          id" +
        "          name" +
        "          data {" +
        "            layers {" +
        "              id" +
        "              opacity" +
        "              ty {" +
        "                __typename" +
        "                ... on PaintLayerTypeLinearGradient {" +
        "                  angle" +
        "                  repeating" +
        "                  stops { at color { hex } }" +
        "                }" +
        "                ... on PaintLayerTypeRadialGradient {" +
        "                  repeating" +
        "                  stops { at color { hex } }" +
        "                }" +
        "              }" +
        "            }" +
        "            shadows { color { hex } offsetX offsetY blur }" +
        "          }" +
        "        }" +
        "        activeBadgeId" +
        "        activeBadge {" +
        "          id" +
        "          name" +
        "          description" +
        "          images { url mime scale width height }" +
        "        }" +
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
          operationName: "jChatPlusSevenTvUserStyle",
          query: query,
          variables: {
            id: sevenTvUserId,
          },
        }),
      })
        .done(function (res) {
          if (res && res.errors) {
            console.warn("jChat 7TV paint: GraphQL errors", res.errors);
          }

          request.resolve(res || null);
        })
        .fail(function (xhr) {
          console.warn(
            "jChat 7TV paint: v4 GraphQL request failed",
            xhr && xhr.status,
            xhr && xhr.responseText,
          );

          request.resolve(null);
        });

      return request.promise();
    },

    extractSevenTvPaint: function (res) {
      if (!res) return null;

      var activePaint = Chat.extractSevenTvActivePaint(res);

      if (activePaint) {
        return activePaint;
      }

      var user = res.user || res;
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
      if (!res) return null;

      var user = res.user || res;

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

      var user =
        res.data && res.data.users && res.data.users.user
          ? res.data.users.user
          : res.user || res;

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

    loadSevenTvUserBadge: function (nick, userId) {
      var resolved = $.Deferred().resolve().promise();

      if (!nick || !userId) {
        return resolved;
      }

      userId = String(userId);

      var hasBadgeCache = Object.prototype.hasOwnProperty.call(
        Chat.info.seventvBadgeCache,
        userId,
      );

      var hasPaintCache = Object.prototype.hasOwnProperty.call(
        Chat.info.seventvPaintCache,
        userId,
      );

      if (hasBadgeCache && (!Chat.info.seventvNamePaints || hasPaintCache)) {
        var cachedBadge = Chat.info.seventvBadgeCache[userId];

        if (cachedBadge) {
          Chat.addUserBadge(nick, cachedBadge);
        }

        return resolved;
      }

      if (Chat.info.seventvBadgeRequests[userId]) {
        return Chat.info.seventvBadgeRequests[userId].done(function () {
          var cachedBadge = Chat.info.seventvBadgeCache[userId];

          if (cachedBadge) {
            Chat.addUserBadge(nick, cachedBadge);
          }
        });
      }

      var request = $.Deferred();

      Chat.info.seventvBadgeRequests[userId] = request.promise();

      function finish(badge, paint) {
        Chat.info.seventvBadgeCache[userId] = badge || null;

        if (Chat.info.seventvNamePaints) {
          Chat.info.seventvPaintCache[userId] = paint || null;
        }

        if (badge) {
          Chat.addUserBadge(nick, badge);
        }

        request.resolve();
      }

      $.getJSON("https://7tv.io/v3/users/twitch/" + encodeURIComponent(userId))
        .done(function (connectionRes) {
          var badge = Chat.extractSevenTvBadge(connectionRes);
          var paint = Chat.info.seventvNamePaints
            ? Chat.extractSevenTvPaint(connectionRes)
            : null;

          var sevenTvUserId = Chat.getSevenTvUserIdFromResponse(connectionRes);
          var hasOnlyColorPaint = paint && paint.name === "7TV Name Color";

          if (
            Chat.info.seventvNamePaints &&
            sevenTvUserId &&
            (!paint || hasOnlyColorPaint)
          ) {
            Chat.loadSevenTvUserStyleV4(sevenTvUserId).done(
              function (styleRes) {
                var v4Badge = Chat.extractSevenTvBadge(styleRes);
                var v4Paint = Chat.extractSevenTvPaint(styleRes);

                finish(v4Badge || badge || null, v4Paint || paint || null);
              },
            );

            return;
          }

          finish(badge || null, paint || null);
        })
        .fail(function () {
          Chat.info.seventvBadgeCache[userId] = null;

          if (Chat.info.seventvNamePaints) {
            Chat.info.seventvPaintCache[userId] = null;
          }

          request.resolve();
        })
        .always(function () {
          delete Chat.info.seventvBadgeRequests[userId];
        });

      return request.promise();
    },
  });
})();
