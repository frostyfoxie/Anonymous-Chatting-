// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCqobhf4HFUdBIZJMF-s9uW3e0-EGh327I",
    authDomain: "anonymous-chatting-c6712.firebaseapp.com",
    databaseURL: "https://anonymous-chatting-c6712-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "anonymous-chatting-c6712",
    storageBucket: "anonymous-chatting-c6712.firebasestorage.app",
    messagingSenderId: "124331866043",
    appId: "1:124331866043:web:8be37be9d84974b4a0b69e"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage();

// State
let userId = localStorage.getItem('userId') || (Math.random().toString(36).substr(2)+Date.now().toString(36));
localStorage.setItem('userId', userId);

let groups = {}; // joined groups
let activeGroupId = null;
let encryptionKeys = {};

// --- Username Generator ---
const adjectives = ['Mysterious','Anonymous','Secret','Hidden','Stealthy','Private','Unknown','Incognito','Covert','Discreet','Silent','Shadowy','Ghostly','Invisible','Cryptic','Masked','Veiled','Enigmatic','Obscure','Camouflaged','Cloaked','Furtive','Hushed','Phantom','Sly','Surreptitious','Elusive','Shady','Unseen','Undercover','Cunning'];
const nouns = ['Phoenix','Panther','Fox','Falcon','Wolf','Eagle','Lion','Tiger','Hawk','Owl','Jaguar','Cheetah','Leopard','Viper','Dragon','Griffin','Raven','Cougar','Serpent','Hydra','Bear','Shark','Cobra','Lynx','Scorpion','Wolverine','Raptor','Stallion','Wolfhound','Manticore'];

function generateUsername() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);
    return `${adj}${noun}${num}`;
}

const currentUser = generateUsername();

// --- UI helpers ---
function addMessage(sender, content, isSystem=false, type='text') {
    const chatArea = document.getElementById('chatArea');
    const div = document.createElement('div');

    if(isSystem){
        div.className = 'message message-incoming';
        div.innerHTML = `<div class="message-sender">${sender}</div><div class="message-content"><i>${content}</i></div>`;
    } else if(type==='text'){
        div.className = sender===currentUser ? 'message message-outgoing':'message message-incoming';
        div.innerHTML = `<div class="message-sender">${sender}</div><div class="message-content">${content}</div>`;
    } else if(type==='image'){
        div.className = sender===currentUser ? 'message message-outgoing':'message message-incoming';
        div.innerHTML = `<div class="message-sender">${sender}</div><img class="message-img" src="data:image/png;base64,${content}" />`;
    }

    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// --- Render group list ---
function renderGroupList() {
    const listDiv = document.getElementById('groupList');
    listDiv.innerHTML = '';
    if(Object.keys(groups).length===0){
        listDiv.innerHTML='<p class="empty-text">No groups joined yet</p>';
        return;
    }
    Object.keys(groups).forEach(gid=>{
        const div = document.createElement('div');
        div.textContent = gid;
        div.className = gid===activeGroupId ? 'group-item active':'group-item';
        div.onclick=()=>switchGroup(gid);
        listDiv.appendChild(div);
    });
}

// --- Switch group ---
function switchGroup(gid){
    activeGroupId = gid;
    document.getElementById('activeGroupTitle').textContent = `Group: ${gid}`;
    renderActiveGroup();
}

// --- Render active group's messages ---
function renderActiveGroup(){
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML='';
    if(!activeGroupId) return;
    const msgs = groups[activeGroupId].messages || [];
    msgs.forEach(msg=>{
        addMessage(msg.sender,msg.content,msg.isSystem,msg.type);
    });
}

// --- Join / Create ---
function createGroup(){
    const groupId = Math.random().toString(36).substring(2,10).toUpperCase();
    const password = Math.random().toString(36).substring(2,12);
    document.getElementById('groupId').value = groupId;
    document.getElementById('password').value = password;
    alert(`New group created!\nID: ${groupId}\nPassword: ${password}`);
}

async function joinGroup(){
    const groupId = document.getElementById('groupId').value.trim();
    const password = document.getElementById('password').value;
    if(!groupId || !password){alert('Enter ID and password'); return;}

    if(groups[groupId]){
        switchGroup(groupId);
        return;
    }

    try{
        // derive key
        const salt = new TextEncoder().encode(groupId);
        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password),{name:'PBKDF2'},false,['deriveKey']);
        const encryptionKey = await crypto.subtle.deriveKey({name:'PBKDF2',salt: salt,iterations:100000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
        encryptionKeys[groupId] = encryptionKey;

        // Save group state
        groups[groupId] = {messages:[]};

        activeGroupId = groupId;
        renderGroupList();
        renderActiveGroup();
        document.getElementById('activeGroupTitle').textContent=`Group: ${groupId}`;
        addMessage('System',`Welcome! You are ${currentUser}`,true);

        // Setup Firebase listeners
        setupListeners(groupId);

    }catch(e){console.error(e);alert('Failed to join group');}
}

// --- Firebase listeners ---
function setupListeners(gid){
    db.ref(`groups/${gid}/messages`).on('child_added', async snap=>{
        const msg = snap.val();
        if(msg.userId===userId) return;
        let content='';
        let type='text';
        if(msg.encryptedText) content = await decryptText(msg.encryptedText,encryptionKeys[gid]);
        else if(msg.encryptedImage){content=await decryptText(msg.encryptedImage,encryptionKeys[gid]); type='image';}
        groups[gid].messages.push({sender:msg.username,content,type,isSystem:false});
        if(gid===activeGroupId) addMessage(msg.username,content,false,type);
    });
}

// --- Encryption helpers ---
async function encryptText(text,key){
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(iv)))+'|'+btoa(String.fromCharCode(...new Uint8Array(cipher)));
}

async function decryptText(data,key){
    const [iv64,cipher64]=data.split('|');
    const iv = Uint8Array.from(atob(iv64),c=>c.charCodeAt(0));
    const cipher = Uint8Array.from(atob(cipher64),c=>c.charCodeAt(0));
    const dec = await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher);
    return new TextDecoder().decode(dec);
}

// --- Sending messages ---
document.getElementById('messageText').addEventListener('keypress',handleKeyPress);
document.getElementById('imageUpload').addEventListener('change',async e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload=async ()=>{
        const base64 = reader.result.split(',')[1];
        const enc = await encryptText(base64,encryptionKeys[activeGroupId]);
        await db.ref(`groups/${activeGroupId}/messages`).push({userId,username:currentUser,encryptedImage:enc});
    };
    reader.readAsDataURL(file);
});

async function sendMessage(){
    const txt = document.getElementById('messageText').value;
    if(!txt || !activeGroupId) return;
    const enc = await encryptText(txt,encryptionKeys[activeGroupId]);
    await db.ref(`groups/${activeGroupId}/messages`).push({userId,username:currentUser,encryptedText:enc});
    groups[activeGroupId].messages.push({sender:currentUser,content:txt,type:'text',isSystem:false});
    addMessage(currentUser,txt,false,'text');
    document.getElementById('messageText').value='';
}

function handleKeyPress(e){if(e.key==='Enter'){sendMessage();}}
