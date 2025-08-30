// === FIREBASE CONFIG ===
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

// === USER INFO & STATE ===
const adjectives = ['Mysterious','Anonymous','Secret','Hidden','Stealthy','Private','Unknown','Incognito','Covert','Discreet'];
const nouns = ['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl'];

function generateUsername() {
  return adjectives[Math.floor(Math.random()*adjectives.length)] +
         nouns[Math.floor(Math.random()*nouns.length)] +
         Math.floor(Math.random()*1000);
}

let username = localStorage.getItem('username') || generateUsername();
localStorage.setItem('username', username);

let userId = localStorage.getItem('userId') || (Math.random().toString(36).substring(2) + Date.now().toString(36));
localStorage.setItem('userId', userId);

let userPFP = localStorage.getItem('userPFP') || '';
if(!userPFP) userPFP = 'https://i.pravatar.cc/150?img=' + Math.floor(Math.random()*70+1); 
localStorage.setItem('userPFP', userPFP);

let activeGroupId = null;
let encryptionKey = null;
let currentDM = null; // For DM mode

// === AES-GCM HELPER FUNCTIONS ===
async function deriveKey(password,saltStr){
  const salt = new TextEncoder().encode(saltStr);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

async function encryptData(data){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv},encryptionKey,data);
  return {iv:Array.from(iv),data:btoa(String.fromCharCode(...new Uint8Array(encrypted)))};
}

async function decryptData(obj){
  return await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(obj.iv)},encryptionKey,Uint8Array.from(atob(obj.data),c=>c.charCodeAt(0)));
}

// === GROUP FUNCTIONS ===
async function joinGroup() {
  const gid = document.getElementById('groupIdInput').value.trim();
  const pwd = document.getElementById('groupPasswordInput').value;
  if(!gid||!pwd) return alert('Enter Group ID and Password');

  activeGroupId = gid;
  currentDM = null; // Reset DM mode
  encryptionKey = await deriveKey(pwd,gid);

  db.ref(`groups/${gid}/users/${userId}`).set({username,lastSeen:Date.now(),pfp:userPFP});
  updateGroupActivity();
  document.getElementById('chatHeader').textContent = 'Group: ' + gid;
  addGroupToList(gid);
  listenMessages();
}

// Update activity timestamp
function updateGroupActivity(){
  if(activeGroupId) db.ref(`groups/${activeGroupId}/lastActive`).set(Date.now());
}

// === UI: SIDEBAR & GROUP LIST ===
function addGroupToList(gid){
  const list = document.getElementById('groupList');
  if([...list.children].some(c=>c.textContent===gid)) return;
  const div = document.createElement('div');
  div.className='group-item active';
  div.textContent=gid;
  div.onclick = () => { activeGroupId=gid; currentDM=null; document.getElementById('chatHeader').textContent='Group: '+gid; listenMessages(); }
  list.appendChild(div);
}

// === MESSAGE FUNCTIONS ===
async function sendMessage(){
  if(!activeGroupId && !currentDM) return alert('Join a group or select a DM first');
  const text = document.getElementById('messageText').value.trim();
  if(!text) return;
  const encryptedObj = await encryptData(new TextEncoder().encode(text));

  let path = activeGroupId ? `groups/${activeGroupId}/messages` : `dms/${userId}_${currentDM}/messages`;
  const msgRef = db.ref(path).push();
  msgRef.set({userId,username,pfp:userPFP,encryptedText:encryptedObj,timestamp:Date.now()});
  setTimeout(()=>msgRef.remove(),24*60*60*1000);
  document.getElementById('messageText').value='';
  if(activeGroupId) updateGroupActivity();
}

async function sendImage(event){
  if(!activeGroupId && !currentDM) return alert('Join a group or select a DM first');
  const file = event.target.files[0]; if(!file) return;
  const arrayBuffer = await file.arrayBuffer();
  const encryptedObj = await encryptData(arrayBuffer);

  let path = activeGroupId ? `groups/${activeGroupId}/messages` : `dms/${userId}_${currentDM}/messages`;
  const msgRef = db.ref(path).push();
  msgRef.set({userId,username,pfp:userPFP,encryptedImage:encryptedObj,timestamp:Date.now()});
  setTimeout(()=>msgRef.remove(),60*1000);
  event.target.value='';
  if(activeGroupId) updateGroupActivity();
}

// === LISTEN MESSAGES ===
function listenMessages(){
  const chatArea = document.getElementById('chatArea'); chatArea.innerHTML='';
  let ref = null;
  if(activeGroupId) ref = db.ref(`groups/${activeGroupId}/messages`);
  else if(currentDM) ref = db.ref(`dms/${userId}_${currentDM}/messages`);
  if(!ref) return;

  ref.off();
  ref.on('child_added', async snap => {
    const msg = snap.val();
    const div = document.createElement('div');
    div.classList.add('message', msg.userId===userId?'outgoing':'incoming');

    try{
      if(msg.encryptedText){
        const decrypted = new TextDecoder().decode(await decryptData(msg.encryptedText));
        div.innerHTML = `<div class="message-sender"><img src="${msg.pfp}" class="participant-pfp"> ${msg.username}</div>${decrypted}`;
      } else if(msg.encryptedImage){
        const decrypted = new Blob([await decryptData(msg.encryptedImage)]);
        const url = URL.createObjectURL(decrypted);
        div.innerHTML = `<div class="message-sender"><img src="${msg.pfp}" class="participant-pfp"> ${msg.username}</div><img src="${url}" class="message-img">`;
      }
    }catch{
      div.innerHTML = `<div class="message-sender">${msg.username}</div>[Cannot decrypt]`;
    }

    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

// === PARTICIPANTS PANEL ===
const participantsPanel = document.createElement('div');
participantsPanel.className='participants-panel';
participantsPanel.innerHTML=`<header>Participants <span style="cursor:pointer" onclick="toggleParticipants()">✖</span></header><ul id="participantsList"></ul>`;
document.body.appendChild(participantsPanel);

function toggleParticipants(){
  participantsPanel.classList.toggle('active');
}

document.addEventListener('click', e => {
  if(!participantsPanel.contains(e.target) && !e.target.closest('.chat-header')) participantsPanel.classList.remove('active');
});

async function showParticipants(){
  if(!activeGroupId) return;
  toggleParticipants();
  const list = document.getElementById('participantsList');
  list.innerHTML='';
  const snapshot = await db.ref(`groups/${activeGroupId}/users`).once('value');
  snapshot.forEach(userSnap => {
    const u = userSnap.val();
    const li = document.createElement('li');
    li.innerHTML = `<img src="${u.pfp}" class="participant-pfp">${u.username}`;
    li.onclick = () => {
      if(u.userId!==userId){
        currentDM = u.userId;
        activeGroupId = null;
        document.getElementById('chatHeader').textContent = `DM: ${u.username}`;
        listenMessages();
      }
    }
    list.appendChild(li);
  });
}

// === AUTO DELETE INACTIVE GROUPS (24H) ===
setInterval(async () => {
  const snapshot = await db.ref('groups').once('value');
  snapshot.forEach(g => {
    const data = g.val();
    if(Date.now() - (data.lastActive || 0) > 24*60*60*1000){
      db.ref(`groups/${g.key}`).remove();
    }
  });
}, 60*60*1000);
