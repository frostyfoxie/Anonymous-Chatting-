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
let activeGroupId = null, activeDMId = null, encryptionKey = null, participantsVisible = false;

// AES key derivation
async function deriveKey(password,saltStr){
  const salt=new TextEncoder().encode(saltStr);
  const keyMaterial=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),{name:'PBKDF2'},false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

// Encrypt/Decrypt
async function encryptData(data){const iv=crypto.getRandomValues(new Uint8Array(12));const enc=await crypto.subtle.encrypt({name:'AES-GCM',iv},encryptionKey,data);return {iv:Array.from(iv),data:btoa(String.fromCharCode(...new Uint8Array(enc)))};}
async function decryptData(obj){return await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(obj.iv)},encryptionKey,Uint8Array.from(atob(obj.data),c=>c.charCodeAt(0)));}

// ===== Groups =====
async function joinGroup(){
  const gid=document.getElementById('groupIdInput').value.trim();
  const pwd=document.getElementById('groupPasswordInput').value;
  if(!gid||!pwd) return alert('Enter group ID & password');
  activeGroupId=gid; activeDMId=null;
  encryptionKey=await deriveKey(pwd,gid);
  db.ref(`groups/${gid}/users/${userId}`).set({username,lastSeen:Date.now()});
  updateHeader('Group: '+gid,gid[0].toUpperCase());
  addGroupToList(gid); listenMessages();
}
function addGroupToList(gid){
  const list=document.getElementById('groupList');
  if([...list.children].some(c=>c.textContent===gid)) return;
  const div=document.createElement('div'); div.className='group-item'; div.textContent=gid;
  div.onclick=()=>{activeGroupId=gid;activeDMId=null;updateHeader('Group: '+gid,gid[0].toUpperCase());listenMessages();if(window.innerWidth<=768) toggleSidebar();}
  list.appendChild(div);
}
async function sendMessage(){
  const text=document.getElementById('messageText').value.trim(); if(!text) return;
  if(activeGroupId){
    const encryptedObj=await encryptData(new TextEncoder().encode(text));
    const msgRef=db.ref(`groups/${activeGroupId}/messages`).push();
    msgRef.set({userId,username,encryptedText:encryptedObj,timestamp:Date.now()});
  } else if(activeDMId){
    const msgRef=db.ref(`dms/${activeDMId}/messages`).push();
    msgRef.set({userId,username,text,timestamp:Date.now()});
  }
  document.getElementById('messageText').value='';
}
async function sendFile(event){
  const file=event.target.files[0]; if(!file) return;
  if(activeGroupId){
    const buffer=await file.arrayBuffer(); const encryptedObj=await encryptData(buffer);
    const msgRef=db.ref(`groups/${activeGroupId}/messages`).push();
    msgRef.set({userId,username,encryptedFile:encryptedObj,filename:file.name,timestamp:Date.now()});
  } else if(activeDMId){
    const reader=new FileReader();
    reader.onload=()=>{ db.ref(`dms/${activeDMId}/messages`).push().set({userId,username,file:reader.result,filename:file.name,timestamp:Date.now()}); };
    reader.readAsDataURL(file);
  }
  event.target.value='';
}
function listenMessages(){
  if(!activeGroupId) return;
  const chatArea=document.getElementById('chatArea'); chatArea.innerHTML='';
  const ref=db.ref(`groups/${activeGroupId}/messages`);
  ref.off(); ref.on('child_added',async snap=>{
    const msg=snap.val(); const div=document.createElement('div'); div.classList.add('message',msg.userId===userId?'outgoing':'incoming');
    try{
      if(msg.encryptedText){ const decrypted=new TextDecoder().decode(await decryptData(msg.encryptedText)); div.innerHTML=`<div class="sender">${msg.username}</div>${decrypted}`; }
      else if(msg.encryptedFile){ const decrypted=new Blob([await decryptData(msg.encryptedFile)]); const url=URL.createObjectURL(decrypted); div.innerHTML=`<div class="sender">${msg.username}</div><a href="${url}" target="_blank">${msg.filename}</a>`; }
    }catch{div.innerHTML=`<div class="sender">${msg.username}</div>[Cannot decrypt]`;}
    chatArea.appendChild(div); chatArea.scrollTop=chatArea.scrollHeight;
  });
}

// ===== DMs =====
function startDM(){
  const otherId=document.getElementById('dmUserInput').value.trim(); if(!otherId) return alert('Enter User ID');
  activeDMId=[userId,otherId].sort().join('_'); activeGroupId=null; encryptionKey=null;
  updateHeader('DM: '+otherId,otherId[0].toUpperCase()); addDMToList(otherId); listenDMMessages();
}
function addDMToList(otherId){
  const list=document.getElementById('dmList');
  if([...list.children].some(c=>c.textContent===otherId)) return;
  const div=document.createElement('div'); div.className='group-item'; div.textContent=otherId;
  div.onclick=()=>{activeDMId=[userId,otherId].sort().join('_'); activeGroupId=null; updateHeader('DM: '+otherId,otherId[0].toUpperCase()); listenDMMessages(); if(window.innerWidth<=768) toggleSidebar();}
  list.appendChild(div);
}
function listenDMMessages(){
  if(!activeDMId) return;
  const chatArea=document.getElementById('chatArea'); chatArea.innerHTML='';
  const ref=db.ref(`dms/${activeDMId}/messages`);
  ref.off(); ref.on('child_added', snap=>{
    const msg=snap.val(); const div=document.createElement('div'); div.classList.add('message',msg.userId===userId?'outgoing':'incoming');
    if(msg.text) div.innerHTML=`<div class="sender">${msg.username}</div>${msg.text}`;
    else if(msg.file) div.innerHTML=`<div class="sender">${msg.username}</div><a href="${msg.file}" target="_blank">${msg.filename}</a>`;
    chatArea.appendChild(div); chatArea.scrollTop=chatArea.scrollHeight;
  });
}

// ===== Header & Sidebar =====
function updateHeader(title,avatar){ document.getElementById('chatTitle').textContent=title; document.getElementById('chatAvatar').textContent=avatar; }
function showGroups(){ document.getElementById('groupList').classList.remove('hidden'); document.querySelector('.join-group').classList.remove('hidden'); document.getElementById('dmList').classList.add('hidden'); document.querySelector('.new-dm').classList.add('hidden'); document.getElementById('groupTab').classList.add('active'); document.getElementById('dmTab').classList.remove('active'); }
function showDMs(){ document.getElementById('groupList').classList.add('hidden'); document.querySelector('.join-group').classList.add('hidden'); document.getElementById('dmList').classList.remove('hidden'); document.querySelector('.new-dm').classList.remove('hidden'); document.getElementById('groupTab').classList.remove('active'); document.getElementById('dmTab').classList.add('active'); }

// Participants Panel Toggle
document.getElementById('participantsToggle').addEventListener('click',()=>{ participantsVisible=!participantsVisible; document.getElementById('participantsPanel').classList.toggle('hidden',!participantsVisible); });

// Mobile Sidebar Toggle
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('show'); }
