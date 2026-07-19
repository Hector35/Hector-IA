const moduleLabels = ['Inicio','Ver','Chat','Archivos','Consumo','Trabajo','Finanzas','Calendario','Fábrica','Ajustes'];

function installShell() {
  if (document.querySelector('.cgpt-menu-button')) return;
  const shell = document.querySelector('.shell');
  const bottom = document.querySelector<HTMLElement>('.bottom');
  if (!shell || !bottom) return;

  const menuButton = document.createElement('button');
  menuButton.className = 'cgpt-menu-button';
  menuButton.setAttribute('aria-label', 'Abrir menú');
  menuButton.innerHTML = '<span></span><span></span><span></span>';

  const backdrop = document.createElement('button');
  backdrop.className = 'cgpt-backdrop';
  backdrop.setAttribute('aria-label', 'Cerrar menú');

  const drawer = document.createElement('section');
  drawer.className = 'cgpt-drawer';
  drawer.setAttribute('aria-label', 'Menú de Héctor OS');
  drawer.innerHTML = `
    <div class="cgpt-drawer-head">
      <div class="cgpt-mark">H</div>
      <div><strong>Héctor OS</strong><small>Asistente personal</small></div>
      <button class="cgpt-close" aria-label="Cerrar menú">×</button>
    </div>
    <button class="cgpt-new-chat">＋ Nuevo chat</button>
    <div class="cgpt-section-label">Herramientas</div>
    <nav class="cgpt-modules"></nav>
    <div class="cgpt-drawer-foot"><span class="cgpt-private-dot"></span> Privado y seguro</div>
  `;

  const close = () => document.body.classList.remove('cgpt-drawer-open');
  const open = () => document.body.classList.add('cgpt-drawer-open');
  menuButton.addEventListener('click', open);
  backdrop.addEventListener('click', close);
  drawer.querySelector('.cgpt-close')?.addEventListener('click', close);

  const originalButtons = Array.from(bottom.querySelectorAll<HTMLButtonElement>('button'));
  const modules = drawer.querySelector('.cgpt-modules')!;
  originalButtons.forEach((button, index) => {
    const clone = document.createElement('button');
    const icon = button.querySelector('svg')?.cloneNode(true);
    if (icon) clone.appendChild(icon);
    const label = document.createElement('span');
    label.textContent = moduleLabels[index] || button.getAttribute('aria-label') || 'Módulo';
    clone.appendChild(label);
    clone.addEventListener('click', () => { button.click(); close(); });
    modules.appendChild(clone);
  });

  drawer.querySelector('.cgpt-new-chat')?.addEventListener('click', () => {
    const chatButton = originalButtons.find(b => b.getAttribute('aria-label') === 'Chat');
    chatButton?.click();
    close();
    setTimeout(() => (document.querySelector<HTMLButtonElement>('.newChat'))?.click(), 50);
  });

  document.body.append(backdrop, drawer, menuButton);
}

const observer = new MutationObserver(installShell);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('load', installShell);
installShell();
