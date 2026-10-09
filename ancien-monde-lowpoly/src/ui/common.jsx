// Petits composants réutilisables. Tout est NON contrôlé : le moteur three.js
// (main.js) lit et écrit le DOM directement par id, React ne re-rend jamais.

export function Section({ title, open, hidden, id, children }) {
  return (
    <details className="sec" open={open} hidden={hidden} id={id}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

// label > span(texte + b[data-for]) + input range
export function Slider({ id, label, min, max, step, value, after, tight }) {
  return (
    <label>
      <span>
        {label}
        {tight ? null : ' '}
        <b data-for={id}></b>
        {after}
      </span>
      <input id={id} type="range" min={min} max={max} step={step} defaultValue={value} />
    </label>
  );
}

// options : [[value, texte], ...]
export function Select({ id, label, options, value }) {
  return (
    <label>
      {label}
      <select id={id} defaultValue={value}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}

export function Check({ id, checked, children }) {
  return (
    <label className="row">
      <input id={id} type="checkbox" defaultChecked={checked} /> {children}
    </label>
  );
}

export function Color({ id, value }) {
  return <input id={id} type="color" defaultValue={value} />;
}

export function Btn({ id, alt, className, children, ...rest }) {
  const cls = [alt ? 'alt' : '', className || ''].filter(Boolean).join(' ') || undefined;
  return (
    <button id={id} type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Tip({ children }) {
  return <p className="tip">{children}</p>;
}

export function Hint({ id, children }) {
  return <small id={id} className="hint">{children}</small>;
}

export function Tab({ name, hidden, children }) {
  return (
    <section className="tab" data-tab={name} hidden={hidden}>
      {children}
    </section>
  );
}

export function PrevRow({ prev, children }) {
  return (
    <div className="prevrow">
      <img className="prev" data-prev={prev} alt="" />
      <div className="btns">{children}</div>
    </div>
  );
}
