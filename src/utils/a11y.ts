import { logger } from './logger';

/**
 * Global Screen Reader Live Announcer
 * Updates the #a11y-announcer aria-live region to inform assistive tech users
 * of dynamic changes without disrupting focus.
 */
export function announceToScreenReader(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  if (typeof document === 'undefined') return;

  try {
    let announcer = document.getElementById('a11y-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'a11y-announcer';
      announcer.className = 'sr-only';
      announcer.setAttribute('aria-live', politeness);
      announcer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(announcer);
    }

    // Set politeness level
    announcer.setAttribute('aria-live', politeness);

    // Clear and update with micro-delay so repeated identical messages trigger speech
    announcer.textContent = '';
    setTimeout(() => {
      if (announcer) {
        announcer.textContent = message;
      }
    }, 50);
  } catch (err) {
    logger.warn('[A11y] Failed to announce to screen reader:', err);
  }
}

/**
 * Setup global Escape key listeners to close any open modal, dropdown, or popover.
 */
export function setupUniversalEscapeHandler(handlers: Array<() => boolean | void>): () => void {
  if (typeof document === 'undefined') return () => {};

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      for (const handler of handlers) {
        // If a handler returns true, it handled the event (stop propagation)
        const handled = handler();
        if (handled === true) {
          e.preventDefault();
          break;
        }
      }
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
