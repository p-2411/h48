// Loaded into the design preview by capture.mjs (as window.__snap). Snapshot of one rendered component: its markup, the CSS rules that touch it or its ancestors
// (pseudo-states stripped for matching), the ancestor chain's classes, and keyframes.
const PSEUDO = /::?(?:hover|focus-visible|focus-within|focus|active|visited|before|after|placeholder|selection|first-letter|first-line|marker|backdrop|-webkit-[\w-]+|-moz-[\w-]+)(?:\([^)]*\))?/g
function splitSel(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out.map((x) => x.trim()) }
function matcher(root, inside, ancestors) {
  return (sel) => {
    if (/(^|[\s,>+~(]):root\b|^html\b|^body\b|:host/.test(sel)) return true
    let s = sel.replace(PSEUDO, '').trim().replace(/[>+~]\s*$/, '').trim()
    if (!s) s = '*'
    try { for (const m of root.querySelectorAll(s)) if (inside.has(m) || ancestors.has(m)) return true } catch (e) { return false }
    return false
  }
}
// Each rule keeps its place in the cascade (its sheet, then its position): [order, text].
function collect(rules, ok, out, keyframes, base) {
  let i = 0
  for (const r of rules) {
    const order = base + String(i++).padStart(5, '0')
    if (r instanceof CSSStyleRule) { if (splitSel(r.selectorText).some(ok)) out.push([order, r.cssText]) }
    else if (r instanceof CSSKeyframesRule) keyframes[r.name] = r.cssText
    else if (r instanceof CSSMediaRule || r instanceof CSSSupportsRule || (window.CSSLayerBlockRule && r instanceof CSSLayerBlockRule) || (window.CSSContainerRule && r instanceof CSSContainerRule)) {
      const inner = []; collect(r.cssRules, ok, inner, keyframes, order + '.')
      if (inner.length) { const head = r.cssText.slice(0, r.cssText.indexOf('{')).trim(); out.push([order, head + ' { ' + inner.map((x) => x[1]).join('\n') + ' }']) }
    }
  }
}
window.__snap = function snap(el) {
  const root = el.getRootNode()
  // The app's own stylesheets only (Vite marks them): not the preview page's own <style>.
  const appSheets = [...document.styleSheets].filter((sh) => sh.ownerNode && sh.ownerNode.hasAttribute && sh.ownerNode.hasAttribute('data-vite-dev-id'))
  const sheets = root === document ? appSheets : [...appSheets, ...root.styleSheets, ...(root.adoptedStyleSheets || [])]
  const inside = new Set([el, ...el.querySelectorAll('*')])
  const ancestors = new Set(); const chain = []
  for (let a = el.parentElement; a; a = a.parentElement) { ancestors.add(a); chain.unshift({ tag: a.tagName.toLowerCase(), id: a.id, cls: a.getAttribute('class') || '', data: Object.fromEntries([...a.attributes].filter((x) => x.name.startsWith('data-')).map((x) => [x.name, x.value])) }) }
  const ok = matcher(root, inside, ancestors)
  const css = [], keyframes = {}
  sheets.forEach((sh, n) => { try { collect(sh.cssRules, ok, css, keyframes, String(n).padStart(3, '0') + ':') } catch (e) {} })
  const used = new Set(); const all = css.map((x) => x[1]).join('\n')
  for (const k of Object.keys(keyframes)) if (all.includes(k)) used.add(['999:' + k, keyframes[k]])
  // Freeze what is hovered or focused now: those elements get a class, and the CSS follows it.
  const frozen = []
  for (const n of inside) { const add = []; try { if (n.matches(':hover')) add.push('snap-hover'); if (n.matches(':focus-within')) add.push('snap-focus-within') } catch (e) {} if (add.length) { n.classList.add(...add); frozen.push([n, add]) } }
  const html = el.outerHTML
  frozen.forEach(([n, add]) => n.classList.remove(...add))
  const fix = (t) => t.replace(/:hover\b/g, '.snap-hover').replace(/:focus-within\b/g, '.snap-focus-within')
  return { html, css: [...css, ...used].map(([o, t]) => [o, fix(t)]), chain, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }
}

