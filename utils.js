function encodeQueryData(data) {
  const ret = [];

  for (let d in data) {
    if (!Object.prototype.hasOwnProperty.call(data, d)) {
      continue;
    }

    const value = data[d];

    if (
      value === false ||
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(value));
  }

  return ret.join("&");
}

function appendCSS(type, name) {
  $("<link/>", {
    rel: "stylesheet",
    type: "text/css",
    class: `preview_${type}`,
    href: `styles/${type}_${name}.css`,
  }).appendTo("head");
}

function removeCSS(type) {
  $(`link[class="preview_${type}"]`).remove();
}