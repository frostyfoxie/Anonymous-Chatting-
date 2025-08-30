// ==================== UI ELEMENTS ====================
const messageInput = document.getElementById('messageText');
const sendBtn = document.getElementById('sendBtn');
const imageInput = document.getElementById('imageUpload');
const chatArea = document.getElementById('chatArea');
const groupList = document.getElementById('groupList');
const pfpInput = document.getElementById('pfpInput');

// ==================== SEND MESSAGE ====================
sendBtn.addEventListener('click', () => {
  const text = messageInput.value.trim();
  if (text) chatApp.sendMessage(text);
});

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (text) chatApp.sendMessage(text);
  }
});

// ==================== IMAGE ATTACHMENT ====================
imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) chatApp.sendImage(file);
  e.target.value = ''; // reset input
});

// ==================== PROFILE PICTURE ====================
pfpInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) chatApp.updatePFP(file);
});

// ==================== PARTICIPANTS LIST TOGGLE ====================
const participantsBtn = document.getElementById('participantsBtn');
const participantsPanel = document.getElementById('participantsPanel');

participantsBtn.addEventListener('click', () => {
  participantsPanel.classList.toggle('hidden');
});

// Hide when clicking outside
document.addEventListener('click', (e) => {
  if (!participantsPanel.contains(e.target) && e.target !== participantsBtn) {
    participantsPanel.classList.add('hidden');
  }
});

// ==================== DM TRIGGER ====================
function setupDMButtons() {
  const dmButtons = document.querySelectorAll('.dm-btn');
  dmButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.userid;
      const uname = btn.dataset.username;
      const upfp = btn.dataset.pfp;
      chatApp.startDM(uid, uname, upfp);
    });
  });
}

// ==================== AUTO SCROLL ====================
const observer = new MutationObserver(() => {
  chatArea.scrollTop = chatArea.scrollHeight;
});
observer.observe(chatArea, { childList: true });

// ==================== INIT ====================
function initUI() {
  setupDMButtons();
  chatApp.listenMessages();
}

// Initialize UI
initUI();
