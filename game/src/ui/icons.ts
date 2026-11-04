// Hand-inked inline SVG icons for the camp screens: no image files, everything drawn here.
const I = (body: string, vb = 24) =>
  `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="1.5" fill="currentColor" stroke="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  coin: I('<circle cx="12" cy="12" r="8"/><path d="M9 9.5h6M9 14.5h6M12 7v10"/>'),
  swap: I('<path d="M7 9l5-4 5 4M7 15l5 4 5-4"/>'),
  wrench: I('<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.6 2.6-2.8-.6-.6-2.8z"/>'),
  crate: I('<path d="M3.5 8.5L12 4l8.5 4.5v9L12 22l-8.5-4.5z"/><path d="M3.5 8.5L12 13l8.5-4.5M12 13v9M7.5 6.3l8.5 4.6"/>'),
  task: I('<path d="M7 3.5h10l1 2v15l-1 .5H7l-1-.5v-15z"/><path d="M9 9h6M9 13h6M9 17h3.5"/>'),
  flag: I('<path d="M5 21V4M5 4.5c4-2 6 2 10 0s4 0 4 0v8s-1-1.8-4 0-6-2-10 0"/>'),
  tent: I('<path d="M2.5 20L12 4l9.5 16zM12 4v16M8.5 20l3.5-6 3.5 6"/>'),
  bell: I('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>'),
  helm: I('<circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8"/>'),
};

/** The captain: hooded drifter with welding goggles and a rag over the mouth. */
export const AVATAR = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs><clipPath id="av-c"><circle cx="32" cy="32" r="29"/></clipPath></defs>
  <circle cx="32" cy="32" r="29" fill="#3e6a64"/>
  <g clip-path="url(#av-c)" stroke="#22170f" stroke-width="2.2" stroke-linejoin="round">
    <path d="M14 22 L58 16 L58 20 L14 27Z" fill="#5d8a80" stroke="none" opacity=".5"/>
    <path d="M8 66 C9 50 18 44 32 44 C46 44 55 50 56 66Z" fill="#8a5a3a"/>
    <path d="M20 49 L32 58 L44 49" fill="none" stroke-width="1.6" opacity=".7"/>
    <path d="M15 40 C12 22 20 10 32 10 C44 10 52 22 49 40 C46 47 40 50 32 50 C24 50 18 47 15 40Z" fill="#b89668"/>
    <path d="M21 36 C20 26 25 19 32 19 C39 19 44 26 43 36 C41 42 37 45 32 45 C27 45 23 42 21 36Z" fill="#d9b48c"/>
    <path d="M20 28 L44 28 L44 33 L20 33Z" fill="#3a3833"/>
    <circle cx="26.5" cy="30.5" r="4.2" fill="#c9602f"/>
    <circle cx="37.5" cy="30.5" r="4.2" fill="#c9602f"/>
    <path d="M24.5 29.2 L27.5 28.4" stroke="#f2e2b8" stroke-width="1.3"/>
    <path d="M35.5 29.2 L38.5 28.4" stroke="#f2e2b8" stroke-width="1.3"/>
    <path d="M21 37 C25 41 39 41 43 37 L44 44 C39 48 25 48 20 44Z" fill="#6e2e18"/>
    <path d="M26 41 L29 46 M34 42 L36 46" stroke-width="1.4" opacity=".6"/>
    <path d="M15 40 C17 46 22 49 26 50" fill="none"/>
  </g>
  <circle cx="32" cy="32" r="29" fill="none" stroke="#22170f" stroke-width="3"/>
</svg>`;
