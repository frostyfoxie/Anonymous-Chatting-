// ==================== Firebase Config ====================
const firebaseConfig = {
  apiKey: "AIzaSyCqobhf4HFUdBIZJMF-s9uW3e0-EGh327I",
  authDomain: "anonymous-chatting-c6712.firebaseapp.com",
  databaseURL: "https://anonymous-chatting-c6712-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "anonymous-chatting-c6712",
  storageBucket: "anonymous-chatting-c6712.appspot.com",
  messagingSenderId: "124331866043",
  appId: "1:124331866043:web:8be37be9d84974b4a0b69e"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==================== USER INITIALIZATION ====================
const adjectives = ['Mysterious','Anonymous','Secret','Hidden','Stealthy','Private','Unknown','Incognito','Covert','Discreet'];
const nouns = ['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl'];

function generateUsername() {
  return adjectives[Math.floor(Math.random()*adjectives.length)] + 
         nouns[Math.floor(Math.random()*nouns.length)] + 
         Math.floor(Math.random()*1000);
}

// Persist username
let username = localStorage.getItem('username');
if (!username) {
  username = generateUsername();
  localStorage.setItem('username', username);
}

// Persist userId
let userId = localStorage.getItem('userId');
if (!userId) {
  userId = Math.random().toString(36).substring(2) + Date.now().toString(36);
  localStorage.setItem('userId', userId);
}

// Default profile picture
let userPFP = localStorage.getItem('userPFP') || "https://placehold.co/50x50/667EEA/FFFFFF?text=You";

// ==================== STATE ====================
let activeGroupId = null;
let encryptionKey = null;
let activeDMUserId = null; // For direct messages

// ==================== ENCRYPTION FUNCTIONS ====================
async function deriveKey(password, saltStr) {
  const salt = new TextEncoder().encode(saltStr);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    data
  );
  return { iv: Array.from(iv), data: btoa(String.fromCharCode(...new Uint8Array(encrypted))) };
}

async function decryptData(obj) {
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(obj.iv) },
    encryptionKey,
    Uint8Array.from(atob(obj.data), c => c.charCodeAt(0))
  );
}

// ==================== GROUP MANAGEMENT ====================
function addGroupToList(gid) {
  const list = document.getElementById('groupList');
  if ([...list.children].some(c => c.dataset.gid === gid)) return;

  const div = document.createElement('div');
  div.className = 'group-item';
  div.dataset.gid = gid;
  div.textContent = gid;
  div.onclick = () => {
    activeGroupId = gid;
    activeDMUserId = null;
    document.getElementById('chatHeader').textContent = 'Group: ' + gid;
    listenMessages();
  };
  list.appendChild(div);
}

async function joinGroup() {
  const gid = document.getElementById('groupIdInput').value.trim();
  const pwd = document.getElementById('groupPasswordInput').value;
  if (!gid || !pwd) return alert('Enter Group ID and Password');
  
  activeGroupId = gid;
  encryptionKey = await deriveKey(pwd, gid);
  
  db.ref(`groups/${gid}/users/${userId}`).set({
    username,
    pfp: userPFP,
    lastSeen: Date.now()
  });
  
  document.getElementById('chatHeader').textContent = 'Group: ' + gid;
  addGroupToList(gid);
  listenMessages();
}

// ==================== MESSAGE FUNCTIONS ====================
async function sendMessage(text) {
  if (!activeGroupId && !activeDMUserId) return;
  if (!text) return;

  const msgObj = { userId, username, pfp: userPFP, timestamp: Date.now() };

  if (activeGroupId) {
    msgObj.encryptedText = await encryptData(new TextEncoder().encode(text));
    const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
    msgRef.set(msgObj);
    setTimeout(() => msgRef.remove(), 24*60*60*1000);
  } else if (activeDMUserId) {
    msgObj.encryptedText = await encryptData(new TextEncoder().encode(text));
    const path = `dms/${[userId,activeDMUserId].sort().join('_')}`;
    const msgRef = db.ref(`${path}`).push();
    msgRef.set(msgObj);
  }

  document.getElementById('messageText').value = '';
}

// ==================== IMAGE ATTACHMENTS ====================
async function sendImage(file) {
  if (!file) return;
  const arrayBuffer = await file.arrayBuffer();
  const encryptedObj = await encryptData(arrayBuffer);

  const msgObj = { userId, username, pfp: userPFP, timestamp: Date.now(), encryptedImage: encryptedObj };

  if (activeGroupId) {
    const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
    msgRef.set(msgObj);
    setTimeout(() => msgRef.remove(), 60*1000);
  } else if (activeDMUserId) {
    const path = `dms/${[userId,activeDMUserId].sort().join('_')}`;
    const msgRef = db.ref(`${path}`).push();
    msgRef.set(msgObj);
  }
}

// ==================== LISTEN TO MESSAGES ====================
function listenMessages() {
  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML = '';

  let ref;
  if (activeGroupId) ref = db.ref(`groups/${activeGroupId}/messages`);
  else if (activeDMUserId) ref = db.ref(`dms/${[userId,activeDMUserId].sort().join('_')}`);
  else return;

  ref.off();
  ref.on('child_added', async snap => {
    const msg = snap.val();
    const div = document.createElement('div');
    div.classList.add('message', msg.userId === userId ? 'outgoing' : 'incoming');

    try {
      if (msg.encryptedText) {
        const decrypted = new TextDecoder().decode(await decryptData(msg.encryptedText));
        div.innerHTML = `<div class="message-sender"><img src="${msg.pfp}" class="w-6 h-6 rounded-full inline mr-2">${msg.username}</div>${decrypted}`;
      } else if (msg.encryptedImage) {
        const decrypted = new Blob([await decryptData(msg.encryptedImage)]);
        const url = URL.createObjectURL(decrypted);
        div.innerHTML = `<div class="message-sender"><img src="${msg.pfp}" class="w-6 h-6 rounded-full inline mr-2">${msg.username}</div><img src="${url}" class="message-img">`;
      }
    } catch {
      div.innerHTML = `<div class="message-sender">${msg.username}</div>[Cannot decrypt]`;
    }

    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

// ==================== PROFILE PICTURE ====================
function updatePFP(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    userPFP = reader.result;
    localStorage.setItem('userPFP', userPFP);
  };
  reader.readAsDataURL(file);
}

// ==================== DM FUNCTIONS ====================
function startDM(targetUserId, targetUsername, targetPFP) {
  activeDMUserId = targetUserId;
  activeGroupId = null;
  document.getElementById('chatHeader').textContent = 'DM: ' + targetUsername;
  listenMessages();
}

// ==================== EXPORT FUNCTIONS ====================
// These will be called from UI JS
window.chatApp = {
  joinGroup, sendMessage, sendImage, updatePFP, startDM
};
