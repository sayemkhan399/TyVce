chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error('Could not enable the OmniVoice side panel:', error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'OPEN_MICROPHONE_SETTINGS') return false;

  chrome.tabs.create({ url: 'chrome://settings/content/microphone' }, () => {
    if (chrome.runtime.lastError) {
      console.error('Could not open Chrome microphone settings:', chrome.runtime.lastError.message);
      sendResponse({ opened: false });
      return;
    }
    sendResponse({ opened: true });
  });

  return true;
});
