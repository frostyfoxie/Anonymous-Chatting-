// --- Firebase Setup ---
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

// --- Persistent Username + Avatar ---
const adjectives = ['Mysterious','Anonymous','Hidden','Secret','Stealthy','Covert','Incognito','Unknown','Private','Discreet'];
const nouns = ['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl'];
function generateUsername() {
  return adjectives[Math.floor(Math.random()*adjectives.length)] +
         nouns[Math.floor(Math.random()*nouns.length)] +
         Math.floor(Math.random()*1000);
}
function generateAvatar() {
  const colors = ['#f87171','#34d399','#60a5fa','#facc15','#a78bfa','#fb7185','#fbbf24','#3b82f6'];
  return colors[Math.floor(Math.random()*colors.length)];
}

let userId = localStorage.getItem('userId') || (Math.random().toString(36).substr(2)+Date.now().toString(36));
localStorage.setItem('userId', userId);

let username = localStorage.getItem('username') || generateUsername();
localStorage.setItem('username', username);

let avatar = localStorage.getItem('avatar') || generateAvatar();
localStorage.setItem('avatar', avatar);

// --- State ---
let activeGroupId = null;
let activeDMUser = null;
let encryptionKey = null;

// --- AES-GCM Helpers ---
async function deriveKey(password, saltStr) {
  const salt = new TextEncoder().encode(saltStr);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:100000, hash:'SHA-256'},
    keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']
  );
}

async function encryptData(data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, encryptionKey, data);
  return {iv: Array.from(iv), data: btoa(String.fromCharCode(...new Uint8Array(encrypted)))};
}

async function decryptData(obj) {
  return await crypto.subtle.decrypt(
    {name:'AES-GCM', iv: new Uint8Array(obj.iv)},
    encryptionKey,
    Uint8Array.from(atob(obj.data), c=>c.charCodeAt(0))
  );
}

// --- Update Activity ---
function updateGroupActivity() {
  if(!activeGroupId) return;
  db.ref(`groups/${activeGroupId}/lastActive`).set(Date.now());
}

// --- Join or Create Group ---
async function joinGroup() {
  const gid = document.getElementById('groupIdInput').value.trim();
  const pwd = document.getElementById('groupPasswordInput').value;
  if(!gid || !pwd) return alert('Enter Group ID and Password');

  activeGroupId = gid;
  encryptionKey = await deriveKey(pwd, gid);

  // Add user to group
  db.ref(`groups/${gid}/users/${userId}`).set({
    username,
    avatar,
    lastSeen: Date.now(),
    createdBy: userId
  });

  updateGroupActivity();
  document.getElementById('chatHeader').textContent = 'Group: ' + gid;
  addGroupToList(gid);
  listenMessages();
  listenParticipants();
}

// --- Sidebar Groups ---
function addGroupToList(gid) {
  const list = document.getElementById('groupList');
  if([...list.children].some(c=>c.dataset.gid === gid)) return;
  const div = document.createElement('div');
  div.className = 'group-item';
  div.dataset.gid = gid;
  div.innerText = gid;
  div.onclick = () => { activeGroupId = gid; activeDMUser = null; document.getElementById('chatHeader').textContent = 'Group: '+gid; listenMessages(); listenParticipants();}
  list.appendChild(div);
}

// --- Send Text ---
async function sendMessage() {
  if(activeDMUser) return sendDM();
  if(!activeGroupId) return alert('Select a group first!');
  const text = document.getElementById('messageText').value.trim();
  if(!text) return;

  const encryptedObj = await encryptData(new TextEncoder().encode(text));
  const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId, username, avatar, encryptedText: encryptedObj, timestamp: Date.now()});
  setTimeout(()=>msgRef.remove(), 24*60*60*1000); // 24h
  document.getElementById('messageText').value='';
  updateGroupActivity();
}

// --- Send Image ---
async function sendImage(event) {
  if(activeDMUser) return sendDMImage(event);
  if(!activeGroupId) return alert('Select a group first!');
  const file = event.target.files[0]; if(!file) return;
  const arrayBuffer = await file.arrayBuffer();
  const encryptedObj = await encryptData(arrayBuffer);
  const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId, username, avatar, encryptedImage: encryptedObj, timestamp: Date.now()});
  setTimeout(()=>msgRef.remove(), 60*1000); // 1 min
  event.target.value='';
  updateGroupActivity();
}

// --- Listen Messages ---
function listenMessages() {
  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML='';
  if(activeGroupId) {
    const ref = db.ref(`groups/${activeGroupId}/messages`);
    ref.off();
    ref.on('child_added', async snap=>{
      const msg = snap.val();
      const div = document.createElement('div');
      div.classList.add('message', msg.userId===userId?'outgoing':'incoming');
      try {
        if(msg.encryptedText){
          const decrypted = new TextDecoder().decode(await decryptData(msg.encryptedText));
          div.innerHTML = `<div class="message-sender"><img src="" style="width:24px;height:24px;border-radius:50%;background:${msg.avatar};margin-right:6px;display:inline-block;">${msg.username}</div>${decrypted}`;
        } else if(msg.encryptedImage){
          const decrypted = new Blob([await decryptData(msg.encryptedImage)]);
          const url = URL.createObjectURL(decrypted);
          div.innerHTML = `<div class="message-sender"><img src="" style="width:24px;height:24px;border-radius:50%;background:${msg.avatar};margin-right:6px;display:inline-block;">${msg.username}</div><img src="${url}" class="message-img">`;
        }
      } catch { div.innerHTML = `<div class="message-sender">${msg.username}</div>[Cannot decrypt]`; }
      chatArea.appendChild(div);
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }
}

// --- Participants Panel ---
function listenParticipants(){
  const panel = document.getElementById('participantsList');
  panel.innerHTML='';
  if(!activeGroupId) return;
  const ref = db.ref(`groups/${activeGroupId}/users`);
  ref.off();
  ref.on('value', snap=>{
    panel.innerHTML='';
    snap.forEach(u=>{
      const data = u.val();
      const div = document.createElement('div');
      div.className = 'participant-item';
      div.innerHTML = `<img src="" style="width:24px;height:24px;border-radius:50%;background:${data.avatar};margin-right:6px;display:inline-block;">${data.username}`;
      div.onclick = () => { startDM(u.key); }
      panel.appendChild(div);
    });
  });
}

// --- DM Functions ---
async function startDM(targetId){
  activeDMUser = targetId;
  activeGroupId = null;
  document.getElementById('chatHeader').textContent = 'DM: '+targetId;
  listenDMMessages();
}

async function sendDM(){
  const text = document.getElementById('messageText').value.trim();
  if(!text || !activeDMUser) return;
  const encryptedObj = await encryptData(new TextEncoder().encode(text));
  const ref = db.ref(`dms/${[userId,activeDMUser].sort().join('_')}`).push();
  ref.set({userId, username, avatar, encryptedText: encryptedObj, timestamp: Date.now()});
  setTimeout(()=>ref.remove(), 24*60*60*1000);
  document.getElementById('messageText').value='';
}

async function sendDMImage(event){
  if(!activeDMUser) return;
  const file = event.target.files[0]; if(!file) return;
  const arrayBuffer = await file.arrayBuffer();
  const encryptedObj = await encryptData(arrayBuffer);
  const ref = db.ref(`dms/${[userId,activeDMUser].sort().join('_')}`).push();
  ref.set({userId, username, avatar, encryptedImage: encryptedObj, timestamp: Date.now()});
  setTimeout(()=>ref.remove(), 60*1000);
  event.target.value='';
}

function listenDMMessages(){
  if(!activeDMUser) return;
  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML='';
  const ref = db.ref(`dms/${[userId,activeDMUser].sort().join('_')}`);
  ref.off();
  ref.on('child_added', async snap=>{
    const msg = snap.val();
    const div = document.createElement('div');
    div.classList.add('message', msg.userId===userId?'outgoing':'incoming');
    try {
      if(msg.encryptedText){
        const decrypted = new TextDecoder().decode(await decryptData(msg.encryptedText));
        div.innerHTML = `<div class="message-sender"><img src="" style="width:24px;height:24px;border-radius:50%;background:${msg.avatar};margin-right:6px;display:inline-block;">${msg.username}</div>${decrypted}`;
      } else if(msg.encryptedImage){
        const decrypted = new Blob([await decryptData(msg.encryptedImage)]);
        const url = URL.createObjectURL(decrypted);
        div.innerHTML = `<div class="message-sender"><img src="" style="width:24px;height:24px;border-radius:50%;background:${msg.avatar};margin-right:6px;display:inline-block;">${msg.username}</div><img src="${url}" class="message-img">`;
      }
    } catch { div.innerHTML = `<div class="message-sender">${msg.username}</div>[Cannot decrypt]`; }
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  });
    }
