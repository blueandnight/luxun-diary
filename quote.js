/* Shared, dependency-free context extraction for person/work previews.
 * In the browser it exposes window.LuxunQuote; in Node it exports via CommonJS.
 * The preview is centered on the actual match, keeps a whole 《…》 title when the
 * match is inside one, and never truncates the matched string itself.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LuxunQuote = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function quoteFor(text, needle) {
    var raw = String(text || "");
    if (needle) {
      var index = raw.indexOf(needle);
      if (index >= 0) {
        var start = index;
        var end = index + needle.length;

        // If the match sits inside 《…》, include the complete title.
        var openTitle = raw.lastIndexOf("《", index);
        var closeTitle = raw.indexOf("》", end);
        var previousClose = raw.lastIndexOf("》", index);
        if (openTitle >= 0 && closeTitle >= 0 && previousClose < openTitle) {
          start = Math.min(start, openTitle);
          end = Math.max(end, closeTitle + 1);
        }

        // Expand to nearby sentence boundaries, but keep the context compact.
        while (start > 0 && index - start < 36 && !/[。！？\n]/.test(raw[start - 1])) start -= 1;
        while (end < raw.length && end - (index + needle.length) < 52 && !/[。！？\n]/.test(raw[end])) end += 1;

        var snippet = raw.slice(start, end).replace(/\s+/g, " ").trim();
        return (start > 0 ? "…" : "") + snippet + (end < raw.length ? "…" : "");
      }
    }

    var fallback = raw.replace(/\s+/g, " ").replace(/^[一二三四五六七八九十]{1,3}(?:\[[一二三四五六七八九十]{1,3}\])?日\s*/, "");
    return fallback.length > 92 ? fallback.slice(0, 92) + "…" : fallback;
  }

  return { quoteFor: quoteFor };
}));
