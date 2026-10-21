#!/usr/bin/env node
/**
 * Resolves what colour each interactive surface actually ends up with, in every
 * state it can be in, and fails when the text would not be readable on it.
 *
 * The bug this exists to catch is not "someone picked a bad colour". It is a
 * cascade accident: the primary-button rule is written
 * `button:hover:not(:disabled)`, and that :not() gives it (0,2,1) — one point
 * more than a card's own `.class:hover` at (0,2,0). Cards built on <button>
 * therefore lost their hover background to the dark generic one while keeping
 * their own dark `color`, because specificity is settled per property and a
 * class outranks a bare element selector for `color`. Dark panel, dark text,
 * label gone. Nothing about either rule looks wrong on its own, and the
 * stylesheet is 270 rules deep, so reading it does not find this.
 *
 * So the check resolves the cascade rather than grepping for colours: for each
 * surface it walks the whole stylesheet, keeps the winning declaration by
 * specificity then source order, follows var() and background inheritance, and
 * measures WCAG contrast on the result.
 *
 * It is a partial CSS engine, and it is only trustworthy while it understands
 * every selector in the file — so anything it cannot parse is a hard failure,
 * never a skip. If this starts failing on a selector form the stylesheet has
 * newly grown, teach the parser rather than filtering the selector out.
 *
 * Usage: npm run check:contrast
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = join(ROOT, "src/styles.css");

/* -------------------------------------------------------------------------
   The surfaces to check.

   A surface is the ancestor chain down to the element, because a background
   of `transparent` means "whatever is behind me", and that answer lives in the
   chain. States are per element, since `tbody tr:hover td` hovers the row and
   colours the cell.

   Add a row here whenever a new interactive surface appears. A surface nobody
   listed is a surface nobody checked.
   ---------------------------------------------------------------------- */
const SURFACES = [
  {
    name: "primary button",
    chain: [{ tag: "div", classes: ["workspace"] }, { tag: "button" }],
    states: ["", "hover"],
  },
  {
    name: "secondary button",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "button", classes: ["secondary"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "danger button",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "button", classes: ["danger"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "link button",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "button", classes: ["link-button"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "queue row",
    chain: [
      { tag: "div", classes: ["compact-queue"] },
      { tag: "button", classes: ["queue-item"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "queue row (active)",
    chain: [
      { tag: "div", classes: ["compact-queue"] },
      { tag: "button", classes: ["queue-item", "active"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "metric tile",
    chain: [
      { tag: "div", classes: ["dashboard-grid"] },
      { tag: "button", classes: ["metric-card"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "campaign card",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "button", classes: ["campaign-card"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "todo card",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "button", classes: ["todo-card"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "theme option",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "button", classes: ["theme-option", "secondary"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "theme option (active)",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "button", classes: ["theme-option", "active"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "tag filter",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "div", classes: ["tag-cloud"] },
      { tag: "button" },
    ],
    states: ["", "hover"],
  },
  {
    name: "tag filter (active)",
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "div", classes: ["tag-cloud"] },
      { tag: "button", classes: ["tag-active"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "sidebar nav item",
    chain: [
      { tag: "aside", classes: ["sidebar"] },
      { tag: "nav" },
      { tag: "button" },
    ],
    states: ["", "hover"],
  },
  {
    name: "sidebar nav item (active)",
    chain: [
      { tag: "aside", classes: ["sidebar"] },
      { tag: "nav" },
      { tag: "button", classes: ["active"] },
    ],
    states: ["", "hover"],
  },
  {
    name: "table cell",
    chain: [{ tag: "table" }, { tag: "tbody" }, { tag: "tr" }, { tag: "td" }],
    states: ["", "hover-ancestor:tr"],
  },
];

/* Status pills: background and text are set together on one class, so the
   chain is short and only the resting state exists. */
for (const cls of [
  "status-sample-shipped",
  "status-ready-for-ads",
  "status-posted",
  "status-completed",
]) {
  SURFACES.push({
    name: cls,
    chain: [
      { tag: "div", classes: ["workspace"] },
      { tag: "span", classes: [cls] },
    ],
    states: [""],
  });
}

/* -------------------------------------------------------------------------
   Parsing
   ---------------------------------------------------------------------- */

/** Strips comments without tripping over the `/` in `url()` or media queries. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Flattens the stylesheet into ordered rules. One level of @media nesting is
 * all this file has; deeper nesting throws rather than being silently dropped.
 */
function parseRules(css) {
  const rules = [];
  let i = 0;
  let order = 0;

  function parseBlock(endAt, media) {
    while (i < endAt) {
      const open = css.indexOf("{", i);
      if (open === -1 || open >= endAt) break;
      const prelude = css.slice(i, open).trim();

      if (prelude.startsWith("@media")) {
        const close = matchBrace(css, open);
        if (media)
          throw new Error(
            `nested @media at index ${open}; parser handles one level`,
          );
        i = open + 1;
        parseBlock(close, prelude);
        i = close + 1;
        continue;
      }
      if (prelude.startsWith("@")) {
        // @keyframes, @font-face and friends: skipped, but only because they
        // cannot set a colour on a surface. Anything else is a surprise.
        if (
          !/^@(keyframes|font-face|supports|charset|import|layer)\b/.test(
            prelude,
          )
        ) {
          throw new Error(`unrecognised at-rule: ${prelude.slice(0, 60)}`);
        }
        i = matchBrace(css, open) + 1;
        continue;
      }

      const close = matchBrace(css, open);
      const body = css.slice(open + 1, close);
      if (body.includes("{"))
        throw new Error(`nested rule inside ${prelude.slice(0, 60)}`);
      for (const selector of prelude.split(",")) {
        const s = selector.trim();
        if (s)
          rules.push({
            selector: s,
            decls: parseDecls(body),
            order: order++,
            media,
          });
      }
      i = close + 1;
    }
  }

  parseBlock(css.length, null);
  return rules;
}

function matchBrace(css, open) {
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}" && --depth === 0) return j;
  }
  throw new Error(`unbalanced brace from index ${open}`);
}

function parseDecls(body) {
  const out = {};
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    if (!prop) continue;
    const important = /!important$/.test(value);
    if (important) value = value.replace(/!important$/, "").trim();
    out[prop] = { value, important };
  }
  return out;
}

/* -------------------------------------------------------------------------
   Selectors
   ---------------------------------------------------------------------- */

const STRUCTURAL =
  /^:(nth-child|nth-last-child|nth-of-type|first-child|last-child|only-child)\b/;
const STATE_PSEUDO = new Set([
  ":hover",
  ":focus",
  ":focus-visible",
  ":active",
  ":disabled",
  ":checked",
]);

/** Splits ".a > .b c" into [{combinator, compound}] left to right. */
function splitComplex(selector) {
  const parts = [];
  let buf = "";
  let depth = 0;
  let combinator = null;
  const push = () => {
    const c = buf.trim();
    if (c) parts.push({ combinator, compound: c });
    buf = "";
  };
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && (ch === ">" || ch === "+" || ch === "~")) {
      push();
      combinator = ch;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      if (buf.trim()) {
        push();
        combinator = " ";
      }
      continue;
    }
    buf += ch;
  }
  push();
  return parts;
}

/** Breaks "button.secondary:hover:not(:disabled)" into its pieces. */
function parseCompound(compound) {
  const out = { tag: null, classes: [], pseudos: [], nots: [], structural: [] };
  let i = 0;
  // leading type or universal selector
  const lead = /^[a-zA-Z*][\w-]*/.exec(compound);
  if (lead) {
    out.tag = lead[0] === "*" ? null : lead[0];
    i = lead[0].length;
  }
  while (i < compound.length) {
    const ch = compound[i];
    if (ch === ".") {
      const m = /^\.([\w-]+)/.exec(compound.slice(i));
      if (!m) throw new Error(`cannot parse class in "${compound}"`);
      out.classes.push(m[1]);
      i += m[0].length;
    } else if (ch === ":") {
      const rest = compound.slice(i);
      if (rest.startsWith(":not(")) {
        const close = findClose(rest, 4);
        out.nots.push(rest.slice(5, close));
        i += close + 1;
      } else if (STRUCTURAL.test(rest)) {
        const m = /^:[\w-]+(\([^)]*\))?/.exec(rest);
        out.structural.push(m[0]);
        i += m[0].length;
      } else {
        const m = /^::?[\w-]+/.exec(rest);
        if (!m) throw new Error(`cannot parse pseudo in "${compound}"`);
        if (
          !STATE_PSEUDO.has(m[0]) &&
          !m[0].startsWith("::") &&
          m[0] !== ":root"
        ) {
          throw new Error(`unknown pseudo-class "${m[0]}" in "${compound}"`);
        }
        out.pseudos.push(m[0]);
        i += m[0].length;
      }
    } else {
      throw new Error(`cannot parse "${compound}" at "${compound.slice(i)}"`);
    }
  }
  return out;
}

function findClose(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")" && --depth === 0) return i;
  }
  throw new Error(`unbalanced parens in "${str}"`);
}

/** Does one compound match one element of a surface chain? */
function matchCompound(compound, el) {
  const c = parseCompound(compound);
  if (c.tag && c.tag !== el.tag) return false;
  for (const cls of c.classes)
    if (!(el.classes || []).includes(cls)) return false;
  // A structural pseudo is treated as not matching. Every one in this
  // stylesheet adjusts borders or grid placement, never colour; if that stops
  // being true the surface list needs to model position and this must change.
  if (c.structural.length) return false;
  for (const p of c.pseudos) {
    if (p.startsWith("::")) return false; // pseudo-elements are not surfaces here
    if (!(el.states || []).includes(p.slice(1))) return false;
  }
  for (const n of c.nots) if (matchCompound(n, el)) return false;
  return true;
}

/** Right-to-left match of a complex selector against the ancestor chain. */
function matches(selector, chain) {
  const parts = splitComplex(selector);
  let ci = chain.length - 1;
  let pi = parts.length - 1;
  if (!matchCompound(parts[pi].compound, chain[ci])) return false;
  pi--;
  ci--;
  while (pi >= 0) {
    // The combinator lives on the part to the right of the one being matched.
    const { combinator } = parts[pi + 1];
    if (combinator === ">") {
      if (ci < 0 || !matchCompound(parts[pi].compound, chain[ci])) return false;
      ci--;
    } else if (combinator === " ") {
      let found = false;
      while (ci >= 0) {
        if (matchCompound(parts[pi].compound, chain[ci])) {
          found = true;
          ci--;
          break;
        }
        ci--;
      }
      if (!found) return false;
    } else {
      throw new Error(
        `combinator "${combinator}" is not supported (in "${selector}")`,
      );
    }
    pi--;
  }
  return true;
}

function specificity(selector) {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const { compound } of splitComplex(selector)) {
    const p = parseCompound(compound);
    if (p.tag) c++;
    b += p.classes.length + p.pseudos.length + p.structural.length;
    for (const n of p.nots) {
      const [, nb, nc] = specificity(n);
      b += nb;
      c += nc;
    }
  }
  return [a, b, c];
}

const cmpSpec = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/* -------------------------------------------------------------------------
   Colour
   ---------------------------------------------------------------------- */

function resolveVars(value, vars, seen = new Set()) {
  return value.replace(
    /var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g,
    (_, name, fallback) => {
      if (seen.has(name)) throw new Error(`circular var ${name}`);
      if (vars[name] === undefined) {
        if (fallback !== undefined) return fallback.trim();
        throw new Error(`undefined custom property ${name}`);
      }
      return resolveVars(vars[name], vars, new Set([...seen, name]));
    },
  );
}

/** Pulls the colour out of a `background` shorthand or a plain colour value. */
function toRgb(value) {
  const v = value.trim().toLowerCase();
  if (!v || v === "none" || v === "transparent" || v === "inherit") return null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const parts = m[1].split(/[,/]/).map((s) => parseFloat(s.trim()));
    if (parts.length >= 4 && parts[3] === 0) return null;
    return parts.slice(0, 3);
  }
  // A shorthand like "transparent url(...)": take the first token that parses.
  const first = v.split(/\s+/)[0];
  if (first !== v) return toRgb(first);
  throw new Error(`cannot parse colour "${value}"`);
}

function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const hex = (rgb) =>
  "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/* -------------------------------------------------------------------------
   Resolution
   ---------------------------------------------------------------------- */

/** The declaration that wins for `prop` on the element at the end of `chain`. */
function resolve(prop, chain, rules, vars) {
  let best = null;
  for (const rule of rules) {
    if (rule.media) continue; // layout-only in this stylesheet; asserted below
    const decl = rule.decls[prop];
    if (!decl) continue;
    if (!matches(rule.selector, chain)) continue;
    const spec = specificity(rule.selector);
    const beats =
      !best ||
      (decl.important && !best.important) ||
      (decl.important === best.important &&
        (cmpSpec(spec, best.spec) > 0 ||
          (cmpSpec(spec, best.spec) === 0 && rule.order > best.order)));
    if (beats)
      best = {
        value: decl.value,
        important: decl.important,
        spec,
        order: rule.order,
        selector: rule.selector,
      };
  }
  if (!best) return null;
  return { ...best, resolved: resolveVars(best.value, vars) };
}

/** Background of the element, falling back through ancestors, then the page. */
function effectiveBackground(chain, rules, vars) {
  for (let i = chain.length; i > 0; i--) {
    const slice = chain.slice(0, i);
    const bg =
      resolve("background-color", slice, rules, vars) ??
      resolve("background", slice, rules, vars);
    if (bg) {
      const rgb = toRgb(bg.resolved);
      if (rgb) return { rgb, from: bg.selector };
    }
  }
  const body = resolve("background", [{ tag: "body" }], rules, vars);
  if (body) {
    const rgb = toRgb(body.resolved);
    if (rgb) return { rgb, from: "body" };
  }
  return { rgb: [255, 255, 255], from: "(default white)" };
}

/** Colour of the element, inheriting up the chain as CSS does. */
function effectiveColor(chain, rules, vars) {
  for (let i = chain.length; i > 0; i--) {
    const c = resolve("color", chain.slice(0, i), rules, vars);
    if (c) {
      const rgb = toRgb(c.resolved);
      if (rgb) return { rgb, from: c.selector };
    }
  }
  const body = resolve("color", [{ tag: "body" }], rules, vars);
  if (body) {
    const rgb = toRgb(body.resolved);
    if (rgb) return { rgb, from: "body" };
  }
  return { rgb: [0, 0, 0], from: "(default black)" };
}

/** Applies a state to the chain: "hover" on the target, or "hover-ancestor:tr". */
function withState(chain, state) {
  const out = chain.map((el) => ({ ...el, states: [...(el.states || [])] }));
  if (!state) return out;
  const ancestor = /^hover-ancestor:(.+)$/.exec(state);
  if (ancestor) {
    const target = out.find((el) => el.tag === ancestor[1]);
    if (!target)
      throw new Error(`no "${ancestor[1]}" in chain for state ${state}`);
    target.states.push("hover");
    return out;
  }
  out[out.length - 1].states.push(state);
  return out;
}

/* -------------------------------------------------------------------------
   Run
   ---------------------------------------------------------------------- */

const MIN_CONTRAST = 4.5; // WCAG AA for body text

/* -------------------------------------------------------------------------
   Themes.

   The stylesheet defines one palette on :root and overrides it for dark, so
   every surface has to be measured twice — a token that is readable on white
   says nothing about the same token on near-black.

   The dark palette is declared in two places: the media query (the default for
   a device set to dark) and the attribute selector (the explicit choice from
   Settings). They must agree, or the toggle would render a different app than
   the system preference. That is checked here rather than trusted.
   ---------------------------------------------------------------------- */
const DARK_MEDIA = /prefers-color-scheme:\s*dark/;
const DARK_MEDIA_SELECTOR = ':root:not([data-theme="light"])';
const DARK_ATTR_SELECTOR = ':root[data-theme="dark"]';

/** Custom properties from one rule, asserting it sets nothing else that paints. */
function themeVars(rule, label) {
  const vars = {};
  for (const [prop, decl] of Object.entries(rule.decls)) {
    if (prop.startsWith("--")) {
      vars[prop] = decl.value;
    } else if (prop !== "color-scheme") {
      throw new Error(
        `${label} sets "${prop}"; a theme block may only set custom properties ` +
          `(and color-scheme), because the resolver reads it as a palette, not as rules`,
      );
    }
  }
  return vars;
}

function sameKeys(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

function collectThemes(rules) {
  const light = {};
  let darkMedia = null;
  let darkAttr = null;
  const themeRules = new Set();

  for (const rule of rules) {
    if (!rule.media && rule.selector === ":root") {
      for (const [prop, decl] of Object.entries(rule.decls)) {
        if (prop.startsWith("--")) light[prop] = decl.value;
      }
      continue;
    }
    if (rule.media && DARK_MEDIA.test(rule.media)) {
      if (rule.selector !== DARK_MEDIA_SELECTOR)
        throw new Error(
          `the dark media query styles "${rule.selector}"; only ` +
            `${DARK_MEDIA_SELECTOR} is modelled, and anything else would be ` +
            `applied in dark mode without being measured`,
        );
      darkMedia = themeVars(rule, "the dark media query");
      themeRules.add(rule);
      continue;
    }
    if (!rule.media && rule.selector === DARK_ATTR_SELECTOR) {
      darkAttr = themeVars(rule, DARK_ATTR_SELECTOR);
      themeRules.add(rule);
      continue;
    }
  }

  if (!Object.keys(light).length)
    throw new Error("no custom properties found on :root");

  if (!darkMedia && !darkAttr)
    return { themes: [["light", light]], themeRules };

  if (!darkMedia || !darkAttr)
    throw new Error(
      "the dark palette must be declared both under prefers-color-scheme and " +
        'on [data-theme="dark"], so the toggle and the system preference agree',
    );

  for (const [prop, value] of Object.entries(darkAttr)) {
    if (darkMedia[prop] !== value)
      throw new Error(
        `${prop} is "${value}" on ${DARK_ATTR_SELECTOR} but ` +
          `"${darkMedia[prop]}" in the dark media query; the toggle and the ` +
          `system preference would render differently`,
      );
  }
  if (!sameKeys(darkMedia, darkAttr))
    throw new Error(
      "the two dark blocks declare different token sets; they must be identical",
    );

  // A colour the dark palette forgets keeps its light value, which is how a
  // white chip ends up on a near-black page. Missing tokens are the failure
  // this check exists for, so name them rather than measuring around them.
  // Only colours: radii and the like are geometry and mean the same in both.
  const isColour = (value) => /^#|^rgba?\(/.test(value.trim());
  const missing = Object.keys(light).filter(
    (prop) => isColour(light[prop]) && !(prop in darkMedia),
  );
  if (missing.length)
    throw new Error(
      `the dark palette does not define ${missing.join(", ")}; each would ` +
        `silently keep its light value`,
    );
  const extra = Object.keys(darkMedia).filter((prop) => !(prop in light));
  if (extra.length)
    throw new Error(
      `the dark palette defines ${extra.join(", ")}, which :root does not; ` +
        `a token with no light value is unreachable in the default theme`,
    );

  return {
    themes: [
      ["light", light],
      ["dark", { ...light, ...darkMedia }],
    ],
    themeRules,
  };
}

function main() {
  const css = stripComments(readFileSync(CSS_PATH, "utf8"));
  const allRules = parseRules(css);
  const { themes, themeRules } = collectThemes(allRules);

  // Theme blocks are a palette, not rules; the resolver reads their values
  // through `vars` and must not also try to match their selectors.
  const rules = allRules.filter((rule) => !themeRules.has(rule));

  // The resolver ignores @media, which is only safe while none of the
  // remaining ones touch colour. Check that rather than assume it.
  for (const rule of rules) {
    if (!rule.media) continue;
    for (const prop of Object.keys(rule.decls)) {
      if (/^(color|background|background-color)$/.test(prop)) {
        throw new Error(
          `${rule.media} sets ${prop} on "${rule.selector}"; the resolver skips @media and would miss it`,
        );
      }
    }
  }

  const rows = [];
  let failed = 0;
  for (const [theme, vars] of themes) {
    for (const surface of SURFACES) {
      for (const state of surface.states) {
        const chain = withState(surface.chain, state);
        const bg = effectiveBackground(chain, rules, vars);
        const fg = effectiveColor(chain, rules, vars);
        const ratio = contrast(fg.rgb, bg.rgb);
        const ok = ratio >= MIN_CONTRAST;
        if (!ok) failed++;
        rows.push({
          name: `${theme}  ${surface.name}${state ? `:${state}` : ""}`,
          fg: hex(fg.rgb),
          bg: hex(bg.rgb),
          ratio,
          ok,
          why: ok
            ? ""
            : `text from \`${fg.from}\`, background from \`${bg.from}\``,
        });
      }
    }
  }

  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    console.log(
      `${r.ok ? "  ok  " : "FAIL  "}${r.name.padEnd(w)}  ${r.fg} on ${r.bg}  ${r.ratio.toFixed(2)}:1${r.why ? `\n        ${r.why}` : ""}`,
    );
  }
  console.log(
    `\n${rows.length} surface states checked across ${themes.length} theme(s) against ${MIN_CONTRAST}:1, ${failed} failing.`,
  );
  if (failed) {
    console.error(
      "\nA failing row usually means a generic rule outranked the element's own.\n" +
        "Compare the two selectors named above: specificity is settled per property,\n" +
        "so a rule can win the background and lose the text colour.\n" +
        "A row that fails in one theme only is a token whose light and dark values\n" +
        "do not play the same role — check --accent-ink and the *-soft pairs.",
    );
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(
    `check-contrast could not read the stylesheet:\n  ${err.message}\n`,
  );
  console.error(
    "This is a deliberate failure. The check is only worth anything while it\n" +
      "understands every selector in styles.css, so it refuses to pass on CSS it\n" +
      "cannot resolve. Teach the parser the new form rather than excluding it.",
  );
  process.exit(1);
}
