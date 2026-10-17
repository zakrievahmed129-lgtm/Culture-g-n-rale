// ═══════════════════════════════════════════════════════════
//  Avatars blocky style "brick / Roblox" en SVG ultra complet
// ═══════════════════════════════════════════════════════════
(function () {
  const SKIN = [
    '#f5cd30', // 0: Jaune Noob classique
    '#ffd7a8', // 1: Peau claire
    '#e0a370', // 2: Hâlé
    '#a8693b', // 3: Métisse
    '#6b4226', // 4: Foncé
    '#7ed957', // 5: Alien vert fluo
    '#b39ddb', // 6: Pastel violet
    '#4fc3f7', // 7: Bleu glace
    '#ffd700', // 8: Or massif étincelant
    '#689f38'  // 9: Zombie mort-vivant
  ];

  const SHIRT = [
    '#0d69ac', // 0: Bleu Noob Roblox
    '#e53935', // 1: Rouge vif
    '#43a047', // 2: Vert émeraude
    '#fb8c00', // 3: Orange punch
    '#8e24aa', // 4: Violet royal
    '#2b2b2b', // 5: Noir hoodie
    '#fdd835', // 6: Jaune canari
    '#ec407a', // 7: Rose bonbon
    '#ffffff', // 8: Smoking blanc
    '#00e676', // 9: Hacker Matrix
    '#ff3d00', // 10: Flammes de gamer
    '#ffd700'  // 11: Veste dorée de luxe
  ];

  const PANTS = [
    '#a4bd47', // 0: Vert Noob Roblox
    '#1e3a8a', // 1: Jean bleu foncé
    '#2b2b2b', // 2: Pantalon noir
    '#6d4c41', // 3: Marron cuir
    '#c62828', // 4: Rouge sport
    '#9e9e9e', // 5: Gris survêtement
    '#ffd700', // 6: Pantalon or brillant
    '#37474f'  // 7: Militaire sombre
  ];

  const FACE_NAMES = [
    'Sourire Noob',
    'Grosse Banane',
    'Choqué OOF !',
    'Lunettes Thug',
    'Derp fou',
    'Kawaii',
    'Man Face Roblox',
    'Yeux Laser ⚡',
    'Chad Barbu',
    'Masque Ninja'
  ];

  const HAT_NAMES = [
    'Aucun',
    'Casquette rouge',
    'Couronne dorée',
    'Chapeau de fête',
    'Haut-de-forme chic',
    'Plot de chantier',
    'Chapeau Cowboy',
    'Poulet sur la tête',
    'Carton de livraison',
    'Casque Viking',
    'Chapeau Hélice',
    'Cornes Démon'
  ];

  const LIMITS = {
    skin: SKIN.length,
    shirt: SHIRT.length,
    pants: PANTS.length,
    face: FACE_NAMES.length,
    hat: HAT_NAMES.length,
  };

  const S = 'stroke="#1b1b1b" stroke-width="3" stroke-linejoin="round"';

  function face(i) {
    const eyes = '<ellipse cx="42" cy="37" rx="2.8" ry="4.2" fill="#1b1b1b"/><ellipse cx="58" cy="37" rx="2.8" ry="4.2" fill="#1b1b1b"/>';
    switch (i) {
      case 1: // grosse banane
        return eyes + '<path d="M38 44 H62 Q61 56 50 56 Q39 56 38 44 Z" fill="#1b1b1b"/><rect x="41" y="44" width="18" height="4" rx="1" fill="#fff"/>';
      case 2: // choqué OOF
        return '<circle cx="42" cy="36" r="4.5" fill="#fff" stroke="#1b1b1b" stroke-width="2"/><circle cx="42" cy="36" r="2" fill="#1b1b1b"/>' +
          '<circle cx="58" cy="36" r="4.5" fill="#fff" stroke="#1b1b1b" stroke-width="2"/><circle cx="58" cy="36" r="2" fill="#1b1b1b"/>' +
          '<ellipse cx="50" cy="50" rx="5" ry="6.5" fill="#1b1b1b"/>';
      case 3: // lunettes thug life
        return '<rect x="33" y="31" width="15" height="10" rx="2" fill="#111"/><rect x="52" y="31" width="15" height="10" rx="2" fill="#111"/>' +
          '<path d="M48 35 H52" stroke="#111" stroke-width="3"/><rect x="35" y="33" width="5" height="2" rx="1" fill="#fff" opacity=".8"/>' +
          '<path d="M42 49 Q52 54 60 46" stroke="#1b1b1b" stroke-width="3" fill="none" stroke-linecap="round"/>';
      case 4: // derp
        return '<circle cx="41" cy="36" r="5.5" fill="#fff" stroke="#1b1b1b" stroke-width="2"/><circle cx="43" cy="38" r="2.4" fill="#1b1b1b"/>' +
          '<circle cx="59" cy="35" r="2.6" fill="#1b1b1b"/>' +
          '<path d="M40 46 Q50 51 60 46" stroke="#1b1b1b" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '<path d="M51 48 Q52 56 57 54 Q58 50 57 47" fill="#ff6b8a" stroke="#1b1b1b" stroke-width="1.8"/>';
      case 5: // kawaii
        return '<path d="M38 38 Q42 33 46 38" stroke="#1b1b1b" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '<path d="M54 38 Q58 33 62 38" stroke="#1b1b1b" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '<ellipse cx="37" cy="45" rx="3.5" ry="2" fill="#ff8fb1" opacity=".8"/><ellipse cx="63" cy="45" rx="3.5" ry="2" fill="#ff8fb1" opacity=".8"/>' +
          '<path d="M45 46 Q50 53 55 46 Z" fill="#1b1b1b"/>';
      case 6: // "Man Face" culte de Roblox ! (mâchoire, sourcil relevé, demi-sourire narquois)
        return '<path d="M35 31 Q43 27 47 32" stroke="#1b1b1b" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
          '<path d="M53 33 Q57 28 65 31" stroke="#1b1b1b" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
          '<ellipse cx="42" cy="36" rx="2.5" ry="3.5" fill="#1b1b1b"/><ellipse cx="58" cy="36" rx="2.5" ry="3.5" fill="#1b1b1b"/>' +
          '<path d="M40 46 Q50 52 64 43" stroke="#1b1b1b" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
          '<path d="M60 42 L64 45" stroke="#1b1b1b" stroke-width="3" stroke-linecap="round"/>';
      case 7: // yeux laser
        return '<circle cx="42" cy="37" r="4.5" fill="#ff1744"/><circle cx="58" cy="37" r="4.5" fill="#ff1744"/>' +
          '<circle cx="42" cy="37" r="2" fill="#fff"/><circle cx="58" cy="37" r="2" fill="#fff"/>' +
          '<path d="M42 37 L20 40 M58 37 L80 40" stroke="#ff1744" stroke-width="2.5" stroke-linecap="round"/>' +
          '<path d="M40 48 Q50 54 60 48" stroke="#1b1b1b" stroke-width="3" fill="none" stroke-linecap="round"/>';
      case 8: // Chad Barbu
        return eyes + '<path d="M36 44 Q50 50 64 44 L66 56 Q50 62 34 56 Z" fill="#3e2723" ' + S + '/>' +
          '<path d="M44 49 H56" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
      case 9: // Masque Ninja
        return '<rect x="30" y="39" width="40" height="20" rx="3" fill="#212121" ' + S + '/>' +
          '<path d="M37 34 Q42 32 46 35" stroke="#1b1b1b" stroke-width="3" fill="none"/>' +
          '<path d="M54 35 Q58 32 63 34" stroke="#1b1b1b" stroke-width="3" fill="none"/>' +
          eyes;
      default: // sourire classique Noob
        return eyes + '<path d="M40 46 Q50 54 60 46" stroke="#1b1b1b" stroke-width="3" fill="none" stroke-linecap="round"/>';
    }
  }

  function hat(i) {
    switch (i) {
      case 1: // casquette de travers
        return `<path d="M30 28 Q30 12 50 12 Q70 12 70 28 Z" fill="#e53935" ${S}/><rect x="56" y="23" width="26" height="6" rx="3" fill="#c62828" ${S}/><circle cx="50" cy="12" r="2.5" fill="#fff" ${S}/>`;
      case 2: // couronne royale
        return `<polygon points="31,26 31,8 40,17 50,3 60,17 69,8 69,26" fill="#ffd23f" ${S}/><circle cx="50" cy="19" r="3" fill="#e53935"/><circle cx="39" cy="22" r="2" fill="#2f80ed"/><circle cx="61" cy="22" r="2" fill="#43a047"/>`;
      case 3: // chapeau de fête
        return `<polygon points="37,25 50,-3 63,25" fill="#ff4fa3" ${S}/><path d="M41 17 L59 17 M44 10 L56 10" stroke="#ffe14d" stroke-width="3"/><circle cx="50" cy="-3" r="4" fill="#ffe14d" ${S}/>`;
      case 4: // haut-de-forme
        return `<rect x="35" y="-1" width="30" height="22" rx="2" fill="#2b2b2b" ${S}/><rect x="35" y="13" width="30" height="5" fill="#e53935"/><rect x="27" y="20" width="46" height="6" rx="3" fill="#2b2b2b" ${S}/>`;
      case 5: // plot de chantier
        return `<polygon points="39,23 46,-3 54,-3 61,23" fill="#ff7a1a" ${S}/><path d="M42 12 L58 12" stroke="#fff" stroke-width="4"/><rect x="31" y="21" width="38" height="6" rx="2" fill="#ff7a1a" ${S}/>`;
      case 6: // chapeau cowboy
        return `<path d="M35 15 Q35 0 50 0 Q65 0 65 15 Z" fill="#8d6e63" ${S}/><path d="M22 22 Q50 16 78 22 Q82 17 76 17 Q50 12 24 17 Z" fill="#6d4c41" ${S}/><rect x="35" y="14" width="30" height="4" fill="#d7ccc8"/>`;
      case 7: // poulet sur la tête
        return `<ellipse cx="50" cy="12" rx="14" ry="11" fill="#fff" ${S}/><polygon points="46,14 42,16 46,18" fill="#ff9800" stroke="#1b1b1b" stroke-width="1.5"/><circle cx="46" cy="10" r="1.8" fill="#1b1b1b"/><path d="M48,2 Q50,-3 54,2" fill="#e53935" ${S}/>`;
      case 8: // carton de livraison
        return `<rect x="28" y="2" width="44" height="23" rx="2" fill="#c79c5e" ${S}/><path d="M46 2 V25" stroke="#a07840" stroke-width="3"/><rect x="33" y="14" width="10" height="6" rx="1" fill="#fff" opacity=".5"/>`;
      case 9: // casque viking à cornes
        return `<path d="M31 23 Q31 8 50 8 Q69 8 69 23 Z" fill="#9e9e9e" ${S}/><path d="M30 18 Q20 16 22 2 Q28 8 32 14 Z" fill="#fff" ${S}/><path d="M70 18 Q80 16 78 2 Q72 8 68 14 Z" fill="#fff" ${S}/><rect x="29" y="21" width="42" height="4" fill="#757575"/>`;
      case 10: // chapeau hélice
        return `<path d="M32 24 Q32 12 50 12 Q68 12 68 24 Z" fill="#29b6f6" ${S}/><rect x="48" y="4" width="4" height="8" fill="#ffeb3b" ${S}/><ellipse cx="40" cy="4" rx="12" ry="3" fill="#e91e63" ${S}/><ellipse cx="60" cy="4" rx="12" ry="3" fill="#4caf50" ${S}/>`;
      case 11: // cornes de démon rouges
        return `<path d="M35 22 Q27 16 28 4 Q34 10 39 19 Z" fill="#d50000" ${S}/><path d="M65 22 Q73 16 72 4 Q66 10 61 19 Z" fill="#d50000" ${S}/>`;
      default:
        return '';
    }
  }

  function svg(a = {}, opts = {}) {
    const skin = SKIN[a.skin] || SKIN[0];
    const shirt = SHIRT[a.shirt] || SHIRT[0];
    const pants = PANTS[a.pants] || PANTS[0];

    // Effet flammes / On Fire quand le joueur a une série
    const onFire = opts.onFire ? `
      <g class="fire-aura" filter="drop-shadow(0 0 8px #ff9800)">
        <path d="M15 110 Q5 70 20 50 Q25 70 35 40 Q40 60 50 25 Q60 60 65 40 Q75 70 80 50 Q95 70 85 110 Z" fill="#ff5722" opacity=".7"/>
        <path d="M22 110 Q12 75 25 58 Q30 75 40 48 Q45 65 50 35 Q55 65 60 48 Q70 75 75 58 Q88 75 78 110 Z" fill="#ffeb3b" opacity=".85"/>
      </g>` : '';

    return `<svg viewBox="0 -10 100 142" xmlns="http://www.w3.org/2000/svg" class="avatar-svg ${opts.onFire ? 'avatar-on-fire' : ''}">
      ${onFire}
      <rect x="27" y="97" width="22" height="30" rx="3" fill="${pants}" ${S}/>
      <rect x="51" y="97" width="22" height="30" rx="3" fill="${pants}" ${S}/>
      <rect x="8" y="60" width="17" height="36" rx="4" fill="${skin}" ${S} class="arm-l"/>
      <rect x="75" y="60" width="17" height="36" rx="4" fill="${skin}" ${S} class="arm-r"/>
      <rect x="25" y="59" width="50" height="39" rx="4" fill="${shirt}" ${S}/>
      <rect x="29" y="62" width="42" height="5" rx="2" fill="#fff" opacity=".2"/>
      <rect x="42" y="56" width="16" height="5" fill="${skin}" ${S}/>
      <rect x="30" y="20" width="40" height="38" rx="8" fill="${skin}" ${S}/>
      <rect x="34" y="23" width="12" height="5" rx="2.5" fill="#fff" opacity=".35"/>
      ${face(a.face)}
      ${hat(a.hat)}
    </svg>`;
  }

  function random() {
    const out = {};
    for (const k in LIMITS) out[k] = Math.floor(Math.random() * LIMITS[k]);
    return out;
  }

  window.Avatar = { svg, random, LIMITS, SKIN, SHIRT, PANTS, FACE_NAMES, HAT_NAMES };
})();
