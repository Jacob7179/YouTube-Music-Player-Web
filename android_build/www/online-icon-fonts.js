// Android WebView: load icon fonts from online CDNs on every app launch.
// Fresh font URLs avoid stale or incomplete cached WebView icon fonts.
(() => {
  const stamp = Date.now();
  const fonts = [
    { name: 'boxicons', file: 'boxicons@2.1.4/fonts/boxicons.woff2',
      alt: 'https://unpkg.com/boxicons@2.1.4/fonts/boxicons.woff2' },
    { name: 'bootstrap-icons', file: 'bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2',
      alt: 'https://unpkg.com/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2' }
  ];
  // Insert online @font-face sources after the vendor CSS. Do not package local fonts.
  const style = document.createElement('style');
  style.id = 'android-online-icon-fonts';
  style.textContent = fonts.map(({ name, file, alt }) =>
    `@font-face{font-family:"${name}";src:url("https://cdn.jsdelivr.net/npm/${file}?refresh=${stamp}") format("woff2"),url("${alt}?refresh=${stamp}") format("woff2");font-style:normal;font-weight:normal;font-display:block;}`
  ).join('\n');
  document.head.appendChild(style);
})();
