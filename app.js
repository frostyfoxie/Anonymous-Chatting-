// Firebase setup
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

// Username & PFP
const adjectives=['Mysterious','Anonymous','Secret','Hidden','Stealthy','Private','Unknown','Incognito','Covert','Discreet'];
const nouns=['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl'];
function generateUsername(){return adjectives[Math.floor(Math.random()*adjectives.length)]+nouns[Math.floor(Math.random()*nouns.length)]+Math.floor(Math.random()*1000);}
let username = localStorage.getItem('username') || generateUsername();
localStorage.setItem('username', username);
let pfp = localStorage.getItem('pfp') || 'https://i.pravatar.cc/150?img=' + Math.floor(Math.random()*70);

// State
let userId = localStorage.getItem('userId') || (Math.random().toString(36).substring(2)+Date.now().toString(36));
localStorage.setItem('userId', userId);
let activeGroupId=null;
let encryptionKey=null;
let currentDM=null;

// AES-GCM helper
async function deriveKey(password,saltStr){
  const salt=new TextEncoder().encode(saltStr);
  const keyMaterial=await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptData(data){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},encryptionKey,data);return {iv:Array.from(iv),data:btoa(String.fromCharCode(...new Uint8Array(encrypted)))};}
async function decryptData(obj){return await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(obj.iv)},encryptionKey,Uint8Array.from(atob(obj.data),c=>c.charCodeAt(0)));}

// Update activity
function updateGroupActivity(){if(activeGroupId) db.ref(`groups/${activeGroupId}/lastActive`).set(Date.now());}

// Join/Create group
async function joinGroup(){
  const gid=document.getElementById('groupIdInput').value.trim();
  const pwd=document.getElementById('groupPasswordInput').value;
  if(!gid||!pwd) return alert('Enter Group ID and Password');
  activeGroupId=gid; currentDM=null;
  encryptionKey=await deriveKey(pwd,gid);
  db.ref(`groups/${gid}/users/${userId}`).set({username,pfp,lastSeen:Date.now(),owner:true});
  updateGroupActivity();
  document.getElementById('chatHeader').textContent='Group: '+gid;
  addGroupToList(gid);
  listenMessages();
}

// Sidebar & Groups
function addGroupToList(gid){
  const list=document.getElementById('groupList');
  if([...list.children].some(c=>c.textContent===gid)) return;
  const div=document.createElement('div');
  div.className='group-item active';
  div.textContent=gid;
  div.onclick=()=>{activeGroupId=gid; currentDM=null; document.getElementById('chatHeader').textContent='Group: '+gid; listenMessages();}
  list.appendChild(div);
}

// Participants panel toggle
document.getElementById('participantsBtn').onclick=()=> {
  const panel=document.getElementById('participantsPanel');
  panel.style.display=(panel.style.display==='flex'?'none':'flex');
};
document.addEventListener('click',e=>{
  const panel=document.getElementById('participantsPanel');
  const btn=document.getElementById('participantsBtn');
  if(!panel.contains(e.target)&&!btn.contains(e.target)) panel.style.display='none';
});

// Send text
async function sendMessage(){
  if(!activeGroupId && !currentDM) return;
  const text=document.getElementById('messageText').value.trim(); if(!text) return;
  const encryptedObj=await encryptData(new TextEncoder().encode(text));
  let refPath=activeGroupId?`groups/${activeGroupId}/messages`:`dm/${currentDM}`;
  const msgRef=db.ref(refPath).push();
  msgRef.set({userId,username,pfp,encryptedText:encryptedObj,timestamp:Date.now()});
  setTimeout(()=>msgRef.remove(),24*60*60*1000);
  document.getElementById('messageText').value='';
  if(activeGroupId) updateGroupActivity();
}

// Send image
async function sendImage(event){
  if(!activeGroupId && !currentDM) return;
  const file=event.target.files[0]; if(!file) return;
  const arrayBuffer=await file.arrayBuffer();
  const encryptedObj=await encryptData(arrayBuffer);
  let refPath=activeGroupId?`groups/${activeGroupId}/messages`:`dm/${currentDM}`;
  const msgRef=db.ref(refPath).push();
  msgRef.set({userId,username,pfp,encryptedImage:encryptedObj,timestamp:Date.now()});
  setTimeout(()=>msgRef.remove(),60*1000);
  event.target.value='';
  if(activeGroupId) updateGroupActivity();
}

// Listen messages
function listenMessages(){
  const chatArea=document.getElementById('chatArea'); chatArea.innerHTML='';
  let ref=db.ref(activeGroupId?`groups/${activeGroupId}/messages`:`dm/${currentDM}`);
  ref.off();
  ref.on('child_added',async snap=>{
    const msg=snap.val();
    const div=document.createElement('div');
    div.classList.add('message', msg.userId===userId?'outgoing':'incoming');
    let pfpImg=`<img src="${msg.pfp}" style="width:24px;height:24px;border-radius:50%;margin-right:6px;">`;
    try{
      if(msg.encryptedText){const decrypted=new TextDecoder().decode(await decryptData(msg.encryptedText));
        div.innerHTML=`<div class="message-sender">${pfpImg}${msg.username}</div>${decrypted}`;}
      else if(msg.encryptedImage){const decrypted=new Blob([await decryptData(msg.encryptedImage)]); const url=URL.createObjectURL(decrypted);
        div.innerHTML=`<div class="message-sender">${pfpImg}${msg.username}</div><img src="${url}" class="message-img">`;}
    }catch{div.innerHTML=`<div class="message-sender">${pfpImg}${msg.username}</div>[Cannot decrypt]`;}
    chatArea.appendChild(div); chatArea.scrollTop=chatArea.scrollHeight;
  });
}

// Load participants
function loadParticipants(){
  if(!activeGroupId) return;
  const panel=document.getElementById('participantsPanel'); panel.innerHTML='';
  db.ref(`groups/${activeGroupId}/users`).once('value',snap=>{
    snap.forEach(child=>{
      const user=child.val();
      const div=document.createElement('div');
      div.className='participant-item';
      div.innerHTML=`<img src="${user.pfp}">${user.username}`;
      div.onclick=()=>{ currentDM=child.key; activeGroupId=null; document.getElementById('chatHeader').textContent='DM: '+user.username; listenMessages();}
      panel.appendChild(div);
    });
  });
                                }
