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

// Persistent username + avatar
let username = localStorage.getItem('username');
let avatar = localStorage.getItem('avatar') || `https://i.pravatar.cc/50?u=${Math.random()}`;
if(!username){
  const adjectives = ['Mysterious','Anonymous','Secret','Hidden','Stealthy','Private','Unknown','Incognito','Covert','Discreet'];
  const nouns = ['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl'];
  username = adjectives[Math.floor(Math.random()*adjectives.length)] + nouns[Math.floor(Math.random()*nouns.length)] + Math.floor(Math.random()*1000);
  localStorage.setItem('username',username);
}
localStorage.setItem('avatar',avatar);

// State
let userId = localStorage.getItem('userId') || (Math.random().toString(36).substring(2)+Date.now().toString(36));
localStorage.setItem('userId',userId);
let activeGroupId=null;
let encryptionKey=null;

// AES-GCM helpers
async function deriveKey(password,saltStr){
  const salt=new TextEncoder().encode(saltStr);
  const keyMaterial=await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptData(data,key=encryptionKey){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);
  return {iv:Array.from(iv),data:btoa(String.fromCharCode(...new Uint8Array(encrypted)))};
}
async function decryptData(obj,key=encryptionKey){
  return await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(obj.iv)},key,Uint8Array.from(atob(obj.data),c=>c.charCodeAt(0)));
}

// Group join
async function joinGroup(){
  const gid=document.getElementById('groupIdInput').value.trim();
  const pwd=document.getElementById('groupPasswordInput').value;
  if(!gid||!pwd) return alert('Enter Group ID and Password');

  activeGroupId=gid;
  encryptionKey=await deriveKey(pwd,gid);

  // Add user
  db.ref(`groups/${gid}/users/${userId}`).set({username,avatar,lastSeen:Date.now()});
  db.ref(`groups/${gid}/creator`).once('value', snap=>{
    if(!snap.exists()) db.ref(`groups/${gid}/creator`).set(userId);
    checkCreator();
  });

  document.getElementById('chatHeader').textContent='Group: '+gid;
  addGroupToList(gid);
  listenMessages();
  listenParticipants();
}

// Sidebar
function addGroupToList(gid){
  const list=document.getElementById('groupList');
  if([...list.children].some(c=>c.textContent===gid)) return;
  const div=document.createElement('div'); div.className='group-item active'; div.textContent=gid;
  div.onclick=()=>{activeGroupId=gid; document.getElementById('chatHeader').textContent='Group: '+gid; listenMessages(); listenParticipants(); checkCreator();}
  list.appendChild(div);
}

// Messages
async function sendMessage(){
  if(!activeGroupId) return;
  const text=document.getElementById('messageText').value.trim();
  if(!text) return;
  const encryptedObj=await encryptData(new TextEncoder().encode(text));
  const msgRef=db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId,username,avatar,encryptedText:encryptedObj,timestamp:Date.now()});
  setTimeout(()=>msgRef.remove(),24*60*60*1000);
  document.getElementById('messageText').value='';
}
async function sendImage(event){
  if(!activeGroupId) return;
  const file=event.target.files[0]; if(!file) return;
  const arrayBuffer=await file.arrayBuffer();
  const encryptedObj=await encryptData(arrayBuffer);
  const msgRef=db.ref(`groups/${activeGroupId}/messages`).push();
  msgRef.set({userId,username,avatar,encryptedImage:encryptedObj,timestamp:Date.now()});
  setTimeout(()=>msgRef.remove(),60*1000);
  event.target.value='';
}

// Listen messages
function listenMessages(){
  if(!activeGroupId) return;
  const chatArea=document.getElementById('chatArea'); chatArea.innerHTML='';
  const ref=db.ref(`groups/${activeGroupId}/messages`);
  ref.off();
  ref.on('child_added', async snap=>{
    const msg=snap.val();
    const div=document.createElement('div'); div.classList.add('message',msg.userId===userId?'outgoing':'incoming');
    try{
      if(msg.encryptedText){const decrypted=new TextDecoder().decode(await decryptData(msg.encryptedText)); div.innerHTML=`<div class="message-sender"><img src="${msg.avatar}">${msg.username}</div>${decrypted}`;}
      else if(msg.encryptedImage){const decrypted=new Blob([await decryptData(msg.encryptedImage)]); const url=URL.createObjectURL(decrypted); div.innerHTML=`<div class="message-sender"><img src="${msg.avatar}">${msg.username}</div><img src="${url}" class="message-img">`;}
    }catch{div.innerHTML=`<div class="message-sender"><img src="${msg.avatar}">${msg.username}</div>[Cannot decrypt]`;}
    chatArea.appendChild(div); chatArea.scrollTop=chatArea.scrollHeight;
  });
}

// Participants list
document.getElementById('participantsBtn').onclick=()=>{document.getElementById('participantsList').style.display='flex';}
document.addEventListener('click',e=>{
  if(!e.target.closest('.chat-header') && !e.target.closest('.participants-list')) document.getElementById('participantsList').style.display='none';
});
function listenParticipants(){
  if(!activeGroupId) return;
  const listDiv=document.getElementById('participantsList'); listDiv.innerHTML='';
  const usersRef=db.ref(`groups/${activeGroupId}/users`);
  usersRef.off();
  usersRef.on('value', snap=>{
    listDiv.innerHTML='';
    snap.forEach(uSnap=>{
      const user=uSnap.val();
      const div=document.createElement('div'); div.className='participant';
      div.innerHTML=`<img src="${user.avatar}"><span>${user.username}</span>`;
      listDiv.appendChild(div);
    });
  });
}

// Creator check + rotate key
async function checkCreator(){
  if(!activeGroupId) return;
  const creatorRef = await db.ref(`groups/${activeGroupId}/creator`).get();
  document.getElementById('rotateKeyBtn').style.display = (creatorRef.val()===userId)?'block':'none';
}
async function rotateGroupKey(newPassword){
  if(!activeGroupId || !newPassword) return;
  const creatorRef = await db.ref(`groups/${activeGroupId}/creator`).get();
  if(creatorRef.val()!==userId) return alert('Only creator can rotate key.');
  encryptionKey = await deriveKey(newPassword,activeGroupId);
  alert('Key rotated successfully! New messages will use new key.');
}
document.getElementById('rotateKeyBtn').onclick=()=>rotateGroupKey(prompt('Enter new group password'));
