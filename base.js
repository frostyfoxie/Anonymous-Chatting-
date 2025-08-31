// auto-delete.js - Firebase message auto-deletion
// Add this to your index.html: <script src="auto-delete.js"></script>

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

// Initialize Firebase if not already initialized
if (typeof firebase === 'undefined') {
  console.error('Firebase is not loaded. Make sure to include Firebase scripts before this file.');
} else if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // Use already initialized app
}

const db = firebase.database();

// Function to delete messages older than 1 minute
function deleteOldMessages() {
  const now = Date.now();
  const oneMinuteAgo = now - 10000; // 60 seconds * 1000 ms
  
  console.log("Checking for old messages to delete...");
  
  // Process groups
  db.ref('groups').once('value').then((groupsSnapshot) => {
    if (!groupsSnapshot.exists()) return;
    
    groupsSnapshot.forEach((groupSnapshot) => {
      const groupKey = groupSnapshot.key;
      const messagesRef = db.ref(`groups/${groupKey}/messages`);
      
      messagesRef.once('value').then((messagesSnapshot) => {
        if (!messagesSnapshot.exists()) return;
        
        const updates = {};
        let hasUpdates = false;
        
        messagesSnapshot.forEach((messageSnapshot) => {
          const message = messageSnapshot.val();
          if (message.timestamp && message.timestamp < oneMinuteAgo) {
            updates[messageSnapshot.key] = null; // Mark for deletion
            hasUpdates = true;
          }
        });
        
        // Apply all deletions at once
        if (hasUpdates) {
          messagesRef.update(updates)
            .then(() => {
              console.log(`Deleted ${Object.keys(updates).length} old messages from group ${groupKey}`);
            })
            .catch((error) => {
              console.error("Error deleting messages from group:", error);
            });
        }
      }).catch((error) => {
        console.error("Error reading messages:", error);
      });
    });
  }).catch((error) => {
    console.error("Error reading groups:", error);
  });
  
  // Process DMs
  db.ref('dms').once('value').then((dmsSnapshot) => {
    if (!dmsSnapshot.exists()) return;
    
    dmsSnapshot.forEach((dmSnapshot) => {
      const dmKey = dmSnapshot.key;
      const messagesRef = db.ref(`dms/${dmKey}/messages`);
      
      messagesRef.once('value').then((messagesSnapshot) => {
        if (!messagesSnapshot.exists()) return;
        
        const updates = {};
        let hasUpdates = false;
        
        messagesSnapshot.forEach((messageSnapshot) => {
          const message = messageSnapshot.val();
          if (message.timestamp && message.timestamp < oneMinuteAgo) {
            updates[messageSnapshot.key] = null; // Mark for deletion
            hasUpdates = true;
          }
        });
        
        // Apply all deletions at once
        if (hasUpdates) {
          messagesRef.update(updates)
            .then(() => {
              console.log(`Deleted ${Object.keys(updates).length} old messages from DM ${dmKey}`);
            })
            .catch((error) => {
              console.error("Error deleting messages from DM:", error);
            });
        }
      }).catch((error) => {
        console.error("Error reading DM messages:", error);
      });
    });
  }).catch((error) => {
    console.error("Error reading DMs:", error);
  });
}

// Run the deletion function every 30 seconds
setInterval(deleteOldMessages, 30000);

// Also run immediately when loaded
setTimeout(deleteOldMessages, 2000);

console.log("Auto-delete script loaded. Messages will be deleted after 1 minute.");
