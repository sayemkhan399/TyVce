(() => {
  if (globalThis.__omniVoiceContentInstalled) return;
  globalThis.__omniVoiceContentInstalled = true;

  let lastFocusedEditable = null;
  let lastEditableRange = null;

  const isEditable = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
    if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) return false;
    return ['text', 'search', 'url', 'tel', 'email'].includes(element.type);
  };

  const saveSelection = () => {
    const activeElement = document.activeElement;
    if (isEditable(activeElement)) lastFocusedEditable = activeElement;

    if (!activeElement?.isContentEditable) return;
    const selection = document.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (activeElement.contains(range.commonAncestorContainer)) {
        lastEditableRange = range.cloneRange();
      }
    }
  };

  document.addEventListener('focusin', (event) => {
    if (isEditable(event.target)) lastFocusedEditable = event.target;
    saveSelection();
  }, true);
  document.addEventListener('selectionchange', saveSelection);

  const insertIntoInput = (element, text) => {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    element.setRangeText(text, start, end, 'end');
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text,
    }));
  };

  const getEditableRange = (element) => {
    const selection = document.getSelection();
    if (selection?.rangeCount) {
      const currentRange = selection.getRangeAt(0);
      if (element.contains(currentRange.commonAncestorContainer)) return currentRange.cloneRange();
    }

    if (lastEditableRange && element.contains(lastEditableRange.commonAncestorContainer)) {
      return lastEditableRange.cloneRange();
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    return range;
  };

  const insertIntoContentEditable = (element, text) => {
    const range = getEditableRange(element);
    element.focus({ preventScroll: true });
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    if (document.execCommand('insertText', false, text)) return;

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text,
    }));
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== 'INSERT_TEXT') return false;

    const element = isEditable(document.activeElement)
      ? document.activeElement
      : lastFocusedEditable;

    if (!element?.isConnected || !isEditable(element)) {
      sendResponse({
        inserted: false,
        error: 'Click a text field or editable area on the webpage before speaking.',
      });
      return false;
    }

    const text = String(message.text || '');
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus({ preventScroll: true });
      insertIntoInput(element, text);
    } else {
      insertIntoContentEditable(element, text);
    }

    sendResponse({ inserted: true });
    return false;
  });
})();
