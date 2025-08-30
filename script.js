// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCqobhf4HFUdBIZJMF-s9uW3e0-EGh327I",
    authDomain: "anonymous-chatting-c6712.firebaseapp.com",
    databaseURL: "https://anonymous-chatting-c6712-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "anonymous-chatting-c6712",
    storageBucket: "anonymous-chatting-c6712.firebasestorage.app",
    messagingSenderId: "124331866043",
    appId: "1:124331866043:web:8be37be9d84974b4a0b69e",
    measurementId: "G-WVDHPRB41K"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage();

// State variables
let currentGroup = null;
let currentUser = null;
let encryptionKey = null;
let userId = null;
let isTyping = false;
let typingTimer = null;

const adjectives = ['Mysterious', 'Anonymous', 'Secret', 'Hidden', 'Stealthy', 'Private', 'Unknown', 'Incognito', 'Covert', 'Discreet'];
const nouns = ['Phoenix', 'Panther', 'Fox', 'Falcon', 'Wolf', 'Eagle', 'Lion', 'Tiger', 'Hawk', 'Owl'];

function generateUsername() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}${Math.floor(Math.random() * 1000)}`;
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function createGroup() {
    const groupId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const password = Math.random().toString(36).substring(2, 15);
    document.getElementById('groupId').value = groupId;
    document.getElementById('password').value = password;
    alert(`New group created!\nGroup ID: ${groupId}\nPassword: ${password}`);
}

async function joinGroup() {
    const groupId = document.getElementById('groupId').value.trim();
    const password = document.getElementById('password').value;
    if (!groupId || !password) {
        alert('Please enter both Group ID and Password');
        return;
    }

    try {
        if (!userId) {
            userId = localStorage.getItem('userId');
            if (!userId) {
                userId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                localStorage.setItem('userId', userId);
            }
        }
        currentUser = generateUsername();

        const salt = new TextEncoder().encode(groupId);
        const keyMaterial = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
        );
        encryptionKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        currentGroup = groupId;

        await db.ref(`groups/${groupId}/users/${userId}`).set({
            username: currentUser,
            joined: Date.now(),
            lastSeen: Date.now()
        });

        setupFirebaseListeners();
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('chatArea').classList.remove('hidden');
        document.getElementById('messageInput').classList.remove('hidden');

        addMessage('System', `Welcome to group ${groupId}! You are known as ${currentUser}.`, true);
    } catch (err) {
        console.error(err);
        alert('Failed to join group: ' + err.message);
    }
}

async function encryptText(plainText, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return { cipherText: arrayBufferToBase64(cipher), iv: arrayBufferToBase64(iv) };
}

async function decryptText(data, key) {
    const cipherArray = base64ToArrayBuffer(data.cipherText);
    const iv = base64ToArrayBuffer(data.iv);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherArray);
    return new TextDecoder().decode(decrypted);
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach(b => binary += String.fromCharCode(b));
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    Array.from(binary).forEach((c, i) => bytes[i] = c.charCodeAt(0));
    return bytes.buffer;
}

function setupFirebaseListeners() {
    db.ref(`groups/${currentGroup}/messages`).on('child_added', async snapshot => {
        const message = snapshot.val();
        if (message.userId === userId) return;

        let decryptedContent = '';
        let type = 'text';

        try {
            if (message.encryptedText) {
                decryptedContent = await decryptText(message.encryptedText, encryptionKey);
            } else if (message.encryptedImage) {
                decryptedContent = await decryptText(message.encryptedImage, encryptionKey);
                type = 'image';
            }
            const senderSnapshot = await db.ref(`groups/${currentGroup}/users/${message.userId}`).once('value');
            const sender = senderSnapshot.val();
            receiveMessage({
                sender: sender.username,
                content: decryptedContent,
                timestamp: message.timestamp,
                type
            });
        } catch (err) {
            console.error('Decrypt error:', err);
        }
    });

    db.ref(`groups/${currentGroup}/users`).on('value', snapshot => {
        updateUserList(snapshot.val());
    });

    db.ref(`groups/${currentGroup}/typing`).on('value', snapshot => {
        updateTypingIndicator(snapshot.val() || {});
    });

    setInterval(() => {
        if (currentGroup) {
            db.ref(`groups/${currentGroup}/users/${userId}/lastSeen`).set(Date.now());
        }
    }, 10000);
}

function updateUserList(users) {
    const usersDiv = document.getElementById('users');
    usersDiv.innerHTML = '';
    if (!users) {
        usersDiv.innerHTML = '<p>No users online</p>';
        return;
    }
    Object.values(users).forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div class="user-avatar">${u.username[0]}</div> ${u.username}`;
        usersDiv.appendChild(div);
    });
}

function updateTypingIndicator(typingUsers) {
    const indicator = document.getElementById('typingIndicator');
    const othersTyping = Object.values(typingUsers).filter(u => u !== currentUser);
    indicator.textContent = othersTyping.length ? `${othersTyping.join(', ')} is typing...` : '';
}

async function sendMessage() {
    const input = document.getElementById('messageText');
    const text = input.value.trim();
    if (!text) return;

    const encrypted = await encryptText(text, encryptionKey);
    await db.ref(`groups/${currentGroup}/messages`).push({
        userId,
        encryptedText: encrypted,
        timestamp: Date.now()
    });
    input.value = '';
}

function receiveMessage({ sender, content, type }) {
    const chatArea = document.getElementById('chatArea');
    const div = document.createElement('div');
    div.className = 'message message-incoming';
    div.innerHTML = `<div class="message-sender">${sender}</div>`;
    if (type === 'text') {
        div.innerHTML += `<div class="message-content">${content}</div>`;
    } else if (type === 'image') {
        div.innerHTML += `<img class="message-img" src="data:image/png;base64,${content}" />`;
    }
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

document.getElementById('messageText').addEventListener('input', () => {
    isTyping = true;
    db.ref(`groups/${currentGroup}/typing/${userId}`).set(currentUser);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        db.ref(`groups/${currentGroup}/typing/${userId}`).remove();
    }, 3000);
});

document.getElementById('imageUpload').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const encrypted = await encryptText(base64, encryptionKey);
        await db.ref(`groups/${currentGroup}/messages`).push({
            userId,
            encryptedImage: encrypted,
            timestamp: Date.now()
        });
    };
    reader.readAsDataURL(file);
});

function handleKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
        }
