export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  type?: ToastType;
  durationMs?: number;
  action?: ToastAction;
}

export function showToast(
  message: string,
  typeOrOptions: ToastType | ToastOptions = 'info',
  durationMs: number = 3500
): void {
  if (typeof document === 'undefined') return;

  let type: ToastType = 'info';
  let duration = durationMs;
  let action: ToastAction | undefined = undefined;

  if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
    type = typeOrOptions.type || 'info';
    duration = typeOrOptions.durationMs ?? durationMs;
    action = typeOrOptions.action;
  } else if (typeof typeOrOptions === 'string') {
    type = typeOrOptions;
  }

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-label', 'Pemberitahuan');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const iconMap: Record<ToastType, string> = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${iconMap[type]}</span>
    <span class="toast-msg">${message}</span>
  `;

  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action-btn';
    actionBtn.type = 'button';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      action?.onClick();
      toast.classList.remove('toast-visible');
      setTimeout(() => {
        toast.remove();
        if (container && container.childNodes.length === 0) {
          container.remove();
        }
      }, 250);
    });
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);

  // Trigger entrance transition
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  // Auto-remove after duration (give extra time if there is an interactive action button)
  const effectiveDuration = action ? Math.max(duration, 6000) : duration;
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => {
      toast.remove();
      if (container && container.childNodes.length === 0) {
        container.remove();
      }
    }, 250);
  }, effectiveDuration);
}
