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

// Username persistence
let username = localStorage.getItem('username') || 'User'+Math.floor(Math.random()*1000);
localStorage.setItem('username', username);
let userId = localStorage.getItem('userId') || (Math.random().toString(36).substring(2)+Date.now().toString(36));
localStorage.setItem('userId', userId);

// State
let activeGroupId = null;
let encryptionKey = null;
let participantsVisible = false;

// Generate AES key
async function deriveKey(password,saltStr){
  const salt = new TextEncoder().encode(saltStr);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:100000, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}

// Encrypt/decrypt
async function encryptData(data){const iv=crypto.getRandomValues(new Uint8Array(12));const enc=await crypto.subtle.encrypt({name:'AES-GCM',iv},encryptionKey,data);return {iv:Array.from(iv),data:btoa(String.fromCharCode(...new Uint8Array(enc)))};}
async function decryptData(obj){return await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(obj.iv)},encryptionKey,Uint8Array.from(atob(obj.data),c=>c.charCodeAt(0)));}

// Join/Create Group
async function joinGroup(){
  const gid = document.getElementById('groupIdInput').value.trim();
  const pwd = document.getElementById('groupPasswordInput').value;
  if(!gid || !pwd) return alert('Enter group ID & password');
  activeGroupId = gid;
  encryptionKey = await deriveKey(pwd,gid);
  db.ref(`groups/${gid}/users/${userId}`).set({username,lastSeen:Date.now()});
  updateHeader(gid);
  addGroupToList(gid);
  listenMessages();
}

// Update chat header
function updateHeader(gid){
  document.getElementById('chatTitle').textContent = 'Group: '+gid;
  document.getElementById('chatAvatar').textContent = gid[0].toUpperCase();
}

// Add group to sidebar
function addGroupToList(gid){
  const list=document.getElementById('groupList');
  if([...list.children].some(c=>c.textContent===gid))return;
  const div=document.createElement('div');
  div.className='group-item';
  div.textContent = gid;
  div.onclick=()=>{activeGroupId=gid;updateHeader(gid);listenMessages();}
  list.appendChild(div);
}

// Send message
async function sendMessage(){
  if(!activeGroupId) return;
  const text=document.getElementById('messageText').value.trim(); if(!text) return;
  const encryptedObj = await encryptData(new TextEncoder().encode(text));
  const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId,username,encryptedText:encryptedObj,timestamp:Date.now()});
  document.getElementById('messageText').value='';
  updateGroupActivity();
}

// Send file
async function sendFile(event){
  if(!activeGroupId) return;
  const file = event.target.files[0]; if(!file) return;
  const buffer = await file.arrayBuffer();
  const encryptedObj = await encryptData(buffer);
  const msgRef = db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId,username,encryptedFile:encryptedObj,filename:file.name,timestamp:Date.now()});
  event.target.value='';
  updateGroupActivity();
}

// Listen messages
function listenMessages(){
  if(!activeGroupId) return;
  const chatArea = document.getElementById('chatArea'); chatArea.innerHTML='';
  const ref=db.ref(`groups/${activeGroupId}/messages`);
  ref.off();
  ref.on('child_added',async snap=>{
    const msg=snap.val();
    const div=document.createElement('div'); div.classList.add('message',msg.userId===userId?'outgoing':'incoming');
    try{
      if(msg.encryptedText){
        const decrypted=new TextDecoder().decode(await decryptData(msg.encryptedText));
        div.innerHTML=`<div class="sender">${msg.username}</div>${decrypted}`;
      }
      else if(msg.encryptedFile){
        const decrypted=new Blob([await decryptData(msg.encryptedFile)]);
        const url = URL.createObjectURL(decrypted);
        div.innerHTML=`<div class="sender">${msg.username}</div><a href="${url}" target="_blank">${msg.filename}</a>`;
      }
    }catch{div.innerHTML=`<div class="sender">${msg.username}</div>[Cannot decrypt]`;}
    chatArea.appendChild(div);
    chatArea.scrollTop=chatArea.scrollHeight;
  });
}

// Update activity
function updateGroupActivity(){if(!activeGroupId) db.ref(`groups/${activeGroupId}/lastActive`).set(Date.now());}

// Participants panel toggle
document.getElementById('participantsToggle').addEventListener('click',()=>{
  participantsVisible = !participantsVisible;
  document.getElementById('participantsPanel').classList.toggle('hidden', !participantsVisible);
});

// Optional: Sidebar toggle for mobile (implement if needed)
