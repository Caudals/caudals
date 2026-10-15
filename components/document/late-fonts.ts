/**
 * The public site's secondary faces, Newsreader (display) and Geist Mono
 * (labels), load after the first paint (launch L-24d).
 *
 * Until `<html data-fonts>` is set, `globals.css` points `--font-newsreader`
 * and `--font-geist-mono` at their metric-matched local fallbacks ("Newsreader
 * Fallback", "Geist Mono Fallback", which next/font generates), so laying out
 * the page requests neither family. This script sets the attribute once the
 * first contentful paint has been presented; the browser then requests the
 * faces the page uses and swaps them in, as `font-display: swap` already did.
 * What a reader sees is unchanged: the fallback until the font arrives, then
 * the font, Newsreader with its optical-size axis (founder decision,
 * PROGRESS §5). Geist, the text face of every largest paint, is preloaded and
 * not gated.
 *
 * Before, the first layout requested Newsreader (~130–150 KB per style) and
 * Geist Mono (~24 KB). On a fast connection they often arrived before the first
 * paint was presented, and Lighthouse's simulation then counted them on the
 * path to the largest paint (+0.1–1 s on slow 4G).
 *
 * Loaded as an async `data:` script that React hoists into the head: it
 * neither blocks the parser nor delays rendering. Browsers without paint
 * timing, and pages that never paint while visible, open the gate after four
 * seconds.
 */
const LATE_FONTS = `(function(){var h=document.documentElement;if(h.hasAttribute("data-fonts"))return;function o(){h.setAttribute("data-fonts","")}var t=setTimeout(o,4e3);try{var p=new PerformanceObserver(function(l){if(l.getEntriesByName("first-contentful-paint").length){p.disconnect();clearTimeout(t);o()}});p.observe({type:"paint",buffered:true})}catch(e){clearTimeout(t);o()}})()`;

export const LATE_FONTS_SRC = `data:text/javascript,${encodeURIComponent(LATE_FONTS)}`;
