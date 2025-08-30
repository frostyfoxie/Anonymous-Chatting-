// Firebase initialization
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

// --- Persistent Username & Avatar ---
let username = localStorage.getItem('username');
let avatar = localStorage.getItem('avatar');
if(!username){
  const adjectives = ['Mysterious','Anonymous','Secret','Hidden','Stealthy','Private','Unknown','Incognito','Covert','Discreet'];
  const nouns = ['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl'];
  username = adjectives[Math.floor(Math.random()*adjectives.length)] + nouns[Math.floor(Math.random()*nouns.length)] + Math.floor(Math.random()*1000);
  localStorage.setItem('username', username);
}
if(!avatar){
  avatar = `https://api.dicebear.com/5.x/identicon/svg?seed=${username}`;
  localStorage.setItem('avatar', avatar);
}

// --- State ---
let userId = localStorage.getItem('userId') || (Math.random().toString(36).substring(2)+Date.now().toString(36));
localStorage.setItem('userId', userId);
let activeGroupId = null;
let activeDMUserId = null;
let encryptionKey = null;

// --- AES-GCM helpers ---
async function deriveKey(password, saltStr){
  const salt = new TextEncoder().encode(saltStr);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}

async function encryptData(data){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv}, encryptionKey, data);
  return {iv:Array.from(iv), data:btoa(String.fromCharCode(...new Uint8Array(encrypted)))};
}

async function decryptData(obj){
  return await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(obj.iv)}, encryptionKey, Uint8Array.from(atob(obj.data), c=>c.charCodeAt(0)));
}

// --- Join / Create Group ---
async function joinGroup(){
  const gid = document.getElementById('groupIdInput').value.trim();
  const pwd = document.getElementById('groupPasswordInput').value;
  if(!gid || !pwd) return alert('Enter Group ID & Password');
  
  activeGroupId = gid;
  activeDMUserId = null;
  encryptionKey = await deriveKey(pwd, gid);

  db.ref(`groups/${gid}/users/${userId}`).set({username, avatar, lastSeen:Date.now()});
  db.ref(`groups/${gid}/lastActive`).set(Date.now());

  addGroupToList(gid);
  document.getElementById('chatHeader').textContent = 'Group: ' + gid;
  listenMessages();
  updateParticipants();
}

// --- Sidebar Group List ---
function addGroupToList(gid){
  const list = document.getElementById('groupList');
  if([...list.children].some(c=>c.textContent===gid)) return;
  const div = document.createElement('div');
  div.className = 'group-item active';
  div.textContent = gid;
  div.onclick = () => {
    activeGroupId = gid;
    activeDMUserId = null;
    document.getElementById('chatHeader').textContent = 'Group: ' + gid;
    listenMessages();
    updateParticipants();
  }
  list.appendChild(div);
}

// --- Send Message ---
async function sendMessage(){
  const text = document.getElementById('messageText').value.trim();
  if(!text) return;

  let ref;
  let payload = {userId, username, avatar, timestamp: Date.now()};
  
  if(activeDMUserId){
    const key = [userId, activeDMUserId].sort().join('_');
    ref = db.ref(`dms/${key}`).push();
    payload.textIfDM = text;
  } else {
    ref = db.ref(`groups/${activeGroupId}/messages`).push();
    payload.encryptedText = await encryptData(new TextEncoder().encode(text));
  }

  ref.set(payload);
  document.getElementById('messageText').value = '';
  if(!activeDMUserId) setTimeout(()=>ref.remove(), 24*60*60*1000);
  if(!activeDMUserId) db.ref(`groups/${activeGroupId}/lastActive`).set(Date.now());
}

// --- Send Image ---
async function sendImage(event){
  const file = event.target.files[0]; if(!file) return;
  const arrayBuffer = await file.arrayBuffer();

  let ref;
  let payload = {userId, username, avatar, timestamp: Date.now()};
  if(activeDMUserId){
    const key = [userId, activeDMUserId].sort().join('_');
    ref = db.ref(`dms/${key}`).push();
    payload.imageIfDM = URL.createObjectURL(new Blob([arrayBuffer]));
  } else {
    ref = db.ref(`groups/${activeGroupId}/messages`).push();
    payload.encryptedImage = await encryptData(arrayBuffer);
  }

  ref.set(payload);
  event.target.value='';
  if(!activeDMUserId) setTimeout(()=>ref.remove(),60*1000);
  if(!activeDMUserId) db.ref(`groups/${activeGroupId}/lastActive`).set(Date.now());
}

// --- Listen Messages ---
function listenMessages(){
  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML='';

  let ref;
  if(activeDMUserId){
    const key = [userId, activeDMUserId].sort().join('_');
    ref = db.ref(`dms/${key}`);
  } else {
    ref = db.ref(`groups/${activeGroupId}/messages`);
  }

  ref.off();
  ref.on('child_added', async snap => {
    const msg = snap.val();
    const div = document.createElement('div');
    div.classList.add('message', msg.userId === userId ? 'outgoing' : 'incoming');

    let content = `<div class="message-sender"><img src="${msg.avatar}" width="24" height="24" style="border-radius:50%;margin-right:5px;">${msg.username}</div>`;
    try{
      if(msg.encryptedText) content += new TextDecoder().decode(await decryptData(msg.encryptedText));
      else if(msg.textIfDM) content += msg.textIfDM;
      else if(msg.encryptedImage){
        const blob = new Blob([await decryptData(msg.encryptedImage)]);
        const url = URL.createObjectURL(blob);
        content += `<img src="${url}" class="message-img">`;
      } else if(msg.imageIfDM){
        content += `<img src="${msg.imageIfDM}" class="message-img">`;
      }
    } catch { content += '[Cannot decrypt]'; }

    div.innerHTML = content;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

// --- Participants Panel ---
function updateParticipants(){
  const panel = document.getElementById('participantsPanel');
  panel.innerHTML = `<h3>Participants</h3>`;
  if(!activeGroupId) return;
  db.ref(`groups/${activeGroupId}/users`).once('value', snap=>{
    snap.forEach(child=>{
      const u = child.val();
      const item = document.createElement('div');
      item.className = 'participant-item';
      item.innerHTML = `<img src="${u.avatar}" width="24" height="24" style="border-radius:50%;margin-right:5px;">${u.username}`;
      item.onclick = ()=>{
        activeDMUserId = child.key;
        document.getElementById('chatHeader').textContent = `DM: ${u.username}`;
        listenMessages();
      }
      panel.appendChild(item);
    });
  });
}

// --- Toggle participants ---
document.getElementById('chatHeader').addEventListener('click', ()=>{
  const panel = document.getElementById('participantsPanel');
  panel.style.display = panel.style.display==='flex'?'none':'flex';
});

// --- Click outside to hide ---
document.addEventListener('click', e=>{
  const panel = document.getElementById('participantsPanel');
  if(!panel.contains(e.target) && !document.getElementById('chatHeader').contains(e.target)){
    panel.style.display='none';
  }
});

// --- Auto delete inactive groups ---
setInterval(()=>{
  db.ref('groups').once('value', snap=>{
    snap.forEach(g=>{
      const lastActive = g.val().lastActive || 0;
      if(Date.now() - lastActive > 24*60*60*1000){
        db.ref(`groups/${g.key}`).remove();
      }
    });
  });
}, 60*60*1000);
