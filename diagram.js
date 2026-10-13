// Court diagrams drawn from a drill's `diagram` spec (see README).
// Spec coordinates are feet on a doubles court seen from above:
//   x 0–36 across (singles sidelines 4.5 / 31.5), y 0 far baseline → 78 near baseline, net y=39.
// The court is drawn landscape (students' side on the left) so it fits a phone card.

const W = 78, H = 36, PAD = 6, R = 2.1;

// court (x, y) → screen (X, Y). Near baseline (y=78) is at X=0, far at X=78.
// A near-side player faces +X, so their forehand side (larger x) is screen-down.
const P = (x, y) => [round(W - y), round(x)];
const round = (n) => Math.round(n * 10) / 10;

function arrow([x1, y1], [x2, y2], cls, dash) {
  const [a, b] = P(x1, y1), [c, d] = P(x2, y2);
  const ang = Math.atan2(d - b, c - a), L = 2.2, s = 0.5;
  const head = [
    [c, d],
    [c - L * Math.cos(ang - s), d - L * Math.sin(ang - s)],
    [c - L * Math.cos(ang + s), d - L * Math.sin(ang + s)],
  ].map((p) => p.map(round).join(",")).join(" ");
  return `<line class="${cls}" x1="${a}" y1="${b}" x2="${c}" y2="${d}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>` +
    `<polygon class="${cls}-head" points="${head}"/>`;
}

function court() {
  const line = (x1, y1, x2, y2) => {
    const [a, b] = P(x1, y1), [c, d] = P(x2, y2);
    return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`;
  };
  return `<rect class="dg-surround" x="${-PAD}" y="${-PAD}" width="${W + 2 * PAD}" height="${H + 2 * PAD}" rx="2"/>
    <rect class="dg-court" x="0" y="0" width="${W}" height="${H}"/>
    <g class="dg-lines">
      <rect x="0" y="0" width="${W}" height="${H}" fill="none"/>
      ${line(4.5, 0, 4.5, 78)}${line(31.5, 0, 31.5, 78)}
      ${line(4.5, 18, 31.5, 18)}${line(4.5, 60, 31.5, 60)}
      ${line(18, 18, 18, 60)}${line(18, 0, 18, 0.8)}${line(18, 78, 18, 77.2)}
    </g>
    <line class="dg-net" x1="${W - 39}" y1="-1.5" x2="${W - 39}" y2="${H + 1.5}"/>`;
}

// People standing close together (a queue, a huddle) would hide each other's
// labels: push overlapping markers apart and keep them inside the frame.
function spread(people) {
  const pts = people.map((p, i) => {
    const [X, Y] = P(p.x, p.y);
    return { p, X: X + i * 0.01, Y };
  });
  const min = 2 * R + 0.3, lim = PAD - R - 0.2;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        let dx = b.X - a.X, dy = b.Y - a.Y, d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1e-3) { dx = 0; dy = 1; d = 1; }
        const push = (min - d) / 2;
        a.X -= (dx / d) * push; a.Y -= (dy / d) * push;
        b.X += (dx / d) * push; b.Y += (dy / d) * push;
        moved = true;
      }
    for (const q of pts) {
      q.X = Math.min(Math.max(q.X, -lim), W + lim);
      q.Y = Math.min(Math.max(q.Y, -lim), H + lim);
    }
    if (!moved) break;
  }
  return pts.map((q) => ({ ...q, X: round(q.X), Y: round(q.Y) }));
}

export function courtSVG(diagram, title = "Drill diagram") {
  if (!diagram) return "";
  const { people = [], cones = [], targets = [], balls = [], moves = [] } = diagram;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const parts = [court()];

  for (const t of targets) {
    // spec rect is in court coords; convert both corners and normalise
    const [a, b] = P(t.x, t.y), [c, d] = P(t.x + t.w, t.y + t.h);
    parts.push(`<rect class="dg-target" x="${Math.min(a, c)}" y="${Math.min(b, d)}" width="${Math.abs(c - a)}" height="${Math.abs(d - b)}" rx="0.6"/>`);
  }
  for (const [x, y] of cones) {
    const [X, Y] = P(x, y);
    parts.push(`<polygon class="dg-cone" points="${X},${round(Y - 1.2)} ${round(X - 1)},${round(Y + 0.8)} ${round(X + 1)},${round(Y + 0.8)}"/>`);
  }
  for (const m of moves) parts.push(arrow(m.from, m.to, "dg-move", "0.6 0.9"));
  for (const b of balls) {
    const fed = b.kind === "feed" || b.kind === "throw"; // coach feeds and hand throws look the same
    parts.push(arrow(b.from, b.to, fed ? "dg-feed" : "dg-shot", fed ? "1.6 1" : ""));
  }
  for (const { p, X, Y } of spread(people)) {
    const coach = /^C/i.test(p.label);
    parts.push(`<g class="${coach ? "dg-coach" : "dg-player"}"><circle cx="${X}" cy="${Y}" r="${R}"/>` +
      `<text x="${X}" y="${round(Y + 0.8)}" text-anchor="middle">${esc(p.label)}</text></g>`);
  }

  return `<svg class="diagram" viewBox="${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}" role="img" aria-label="${esc(title)}">${parts.join("")}</svg>`;
}

export const DIAGRAM_LEGEND = `<div class="dg-legend">
  <span><i class="lg-player"></i>Player</span><span><i class="lg-coach"></i>Coach / feeder</span>
  <span><i class="lg-feed"></i>Feed</span><span><i class="lg-shot"></i>Shot</span><span><i class="lg-move"></i>Movement</span>
  <span><i class="lg-cone"></i>Cone</span><span><i class="lg-target"></i>Target</span>
</div>`;
