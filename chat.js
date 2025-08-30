// Firebase config
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

// Generate persistent username
let username = localStorage.getItem('username');
if(!username) {
  const adjectives = ['Mysterious','Anonymous','Secret','Hidden','Stealthy','Private','Unknown','Incognito','Covert','Discreet'];
  const nouns = ['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl'];
  username = adjectives[Math.floor(Math.random()*adjectives.length)] + nouns[Math.floor(Math.random()*nouns.length)] + Math.floor(Math.random()*1000);
  localStorage.setItem('username', username);
}

// User ID
let userId = localStorage.getItem('userId') || (Math.random().toString(36).substring(2)+Date.now().toString(36));
localStorage.setItem('userId', userId);

// State
let activeGroupId = null;
let encryptionKey = null;

// UI Elements
const chatArea = document.getElementById('chatArea');
const chatName = document.getElementById('chatName');
const chatAvatar = document.getElementById('chatAvatar');
const memberCount = document.getElementById('memberCount');
const participantsPanel = document.getElementById('participantsPanel');
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const toggleParticipantsBtn = document.getElementById('toggleParticipantsBtn');

// Sidebar toggle (mobile)
toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('hide');
});

// Participants panel toggle
toggleParticipantsBtn.addEventListener('click', () => {
  participantsPanel.classList.toggle('hidden');
});

// Hide participants panel on outside click
document.addEventListener('click', (e)=>{
  if(!participantsPanel.contains(e.target) && !toggleParticipantsBtn.contains(e.target)){
    participantsPanel.classList.add('hidden');
  }
});

// Derive AES key
async function deriveKey(password,saltStr){
  const salt=new TextEncoder().encode(saltStr);
  const keyMaterial=await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

// Encrypt/Decrypt helpers
async function encryptData(data){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},encryptionKey,data);
  return {iv:Array.from(iv),data:btoa(String.fromCharCode(...new Uint8Array(encrypted)))};
}
async function decryptData(obj){
  return await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(obj.iv)},encryptionKey,Uint8Array.from(atob(obj.data),c=>c.charCodeAt(0)));
}

// Join group
async function joinGroup(){
  const gid=document.getElementById('groupIdInput').value.trim();
  const pwd=document.getElementById('groupPasswordInput').value;
  if(!gid||!pwd) return alert('Enter Group ID and Password');

  activeGroupId = gid;
  encryptionKey = await deriveKey(pwd, gid);

  db.ref(`groups/${gid}/users/${userId}`).set({username,lastSeen:Date.now()});
  db.ref(`groups/${gid}/lastActive`).set(Date.now());

  chatName.textContent = 'Group: '+gid;
  chatAvatar.textContent = gid.charAt(0).toUpperCase();
  memberCount.textContent = 'Loading...';

  addGroupToList(gid);
  listenMessages();
  listenParticipants();
}

// Sidebar group list
function addGroupToList(gid){
  const list=document.getElementById('groupList');
  if([...list.children].some(c=>c.textContent===gid)) return;

  const div=document.createElement('li');
  div.className='group-item p-3 rounded-md cursor-pointer hover:bg-gray-100 flex items-center justify-between';
  div.textContent = gid;
  div.onclick = () => {
    activeGroupId=gid;
    chatName.textContent='Group: '+gid;
    chatAvatar.textContent = gid.charAt(0).toUpperCase();
    listenMessages();
    listenParticipants();
  }
  list.appendChild(div);
}

// Send message
async function sendMessage(){
  if(!activeGroupId) return;
  const text = document.getElementById('messageText').value.trim();
  if(!text) return;
  const encryptedObj = await encryptData(new TextEncoder().encode(text));
  const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId,username,encryptedText:encryptedObj,timestamp:Date.now()});
  document.getElementById('messageText').value='';
}

// Send attachment
async function sendAttachment(event){
  if(!activeGroupId) return;
  const file = event.target.files[0]; if(!file) return;
  const buffer = await file.arrayBuffer();
  const encryptedObj = await encryptData(buffer);
  const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId,username,encryptedFile:encryptedObj,filename:file.name,timestamp:Date.now()});
  event.target.value='';
}

// Listen messages
function listenMessages(){
  if(!activeGroupId) return;
  chatArea.innerHTML='';
  const ref=db.ref(`groups/${activeGroupId}/messages`);
  ref.off();
  ref.on('child_added', async snap=>{
    const msg = snap.val();
    const div = document.createElement('div');
    div.className = msg.userId===userId ? 'message outgoing' : 'message incoming';
    try{
      if(msg.encryptedText){
        const decrypted = new TextDecoder().decode(await decryptData(msg.encryptedText));
        div.innerHTML = `<div class="sender">${msg.username}</div><div class="text">${decrypted}</div>`;
      } else if(msg.encryptedFile){
        const blob = new Blob([await decryptData(msg.encryptedFile)]);
        const url = URL.createObjectURL(blob);
        div.innerHTML = `<div class="sender">${msg.username}</div><a href="${url}" target="_blank">${msg.filename}</a>`;
      }
    }catch{ div.innerHTML = `<div class="sender">${msg.username}</div>[Cannot decrypt]`; }
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

// Participants list
function listenParticipants(){
  if(!activeGroupId) return;
  participantsPanel.innerHTML='';
  const ref=db.ref(`groups/${activeGroupId}/users`);
  ref.on('value', snap=>{
    participantsPanel.innerHTML='';
    const users = snap.val();
    if(!users) return;
    memberCount.textContent = Object.keys(users).length + ' members';
    Object.entries(users).forEach(([id,user])=>{
      const div = document.createElement('div');
      div.className='participant-item p-2 flex items-center justify-between hover:bg-gray-100 rounded-md cursor-pointer';
      div.innerHTML = `<span>${user.username}</span><button onclick="startDM('${id}','${user.username}')">DM</button>`;
      participantsPanel.appendChild(div);
    });
  });
}

// DM functionality
let activeDMUserId = null;
async function startDM(dmId, dmName){
  activeDMUserId = dmId;
  chatName.textContent = 'DM: '+dmName;
  chatAvatar.textContent = dmName.charAt(0).toUpperCase();
  chatArea.innerHTML = '';
  // For DM, listen on separate path
  const ref = db.ref(`DMs/${userId}_${dmId}`);
  ref.off();
  ref.on('child_added', async snap=>{
    const msg = snap.val();
    const div = document.createElement('div');
    div.className = msg.userId===userId ? 'message outgoing' : 'message incoming';
    try{
      if(msg.encryptedText){
        const decrypted = new TextDecoder().decode(await decryptData(msg.encryptedText));
        div.innerHTML = `<div class="sender">${msg.username}</div><div class="text">${decrypted}</div>`;
      } else if(msg.encryptedFile){
        const blob = new Blob([await decryptData(msg.encryptedFile)]);
        const url = URL.createObjectURL(blob);
        div.innerHTML = `<div class="sender">${msg.username}</div><a href="${url}" target="_blank">${msg.filename}</a>`;
      }
    }catch{ div.innerHTML = `<div class="sender">${msg.username}</div>[Cannot decrypt]`; }
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

// Send message (DM or Group)
async function sendMessage(){
  const text = document.getElementById('messageText').value.trim();
  if(!text) return;
  const encryptedObj = await encryptData(new TextEncoder().encode(text));
  const path = activeDMUserId ? `DMs/${userId}_${activeDMUserId}` : `groups/${activeGroupId}/messages`;
  db.ref(path).push().set({userId,username,encryptedText:encryptedObj,timestamp:Date.now()});
  document.getElementById('messageText').value='';
}

// Send attachment (DM or Group)
async function sendAttachment(event){
  const file = event.target.files[0]; if(!file) return;
  const buffer = await file.arrayBuffer();
  const encryptedObj = await encryptData(buffer);
  const path = activeDMUserId ? `DMs/${userId}_${activeDMUserId}` : `groups/${activeGroupId}/messages`;
  db.ref(path).push().set({userId,username,encryptedFile:encryptedObj,filename:file.name,timestamp:Date.now()});
  event.target.value='';
                                                  }
