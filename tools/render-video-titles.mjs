/** Escapes all text before updating static, no-JavaScript title fallbacks. */
import '../video-names.js';
import '../original-video-names.js';
import '../video-title-map.js';
import '../video-titles.js';
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function renderWorkTitles(html,data) {
  const projects=new Map(data.projects.map(p=>[p.id,p]));
  return html.replace(/<article\b[^>]*data-project-id="([^"]+)"[^>]*>[\s\S]*?<\/article>/g,(article,id)=>{
    const p=projects.get(id);if(!p)return article;
    const title=escape(globalThis.KixorVideoTitles.title(p));
    return article.replace(/aria-label="Watch [^"]*"/,`aria-label="Watch ${title}"`).replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/,`<h2 title="${title}">${title}</h2>`);
  });
}
