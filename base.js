// =========================
// base.js - Auto-delete for Anonymous Chat
// =========================

// ==== Testing durations (in milliseconds) ====
const MESSAGE_LIFETIME = 10 * 1000;  // 10 seconds
const FILE_LIFETIME = 10 * 1000;     // 10 seconds
const USER_LIFETIME = 10 * 1000;     // 10 seconds
const GROUP_LIFETIME = 10 * 1000;    // 10 seconds

// Cleanup function
function autoCleanup() {
  const now = Date.now();

  firebase.database().ref('groups').once('value').then(snapshot => {
    snapshot.forEach(groupSnap => {
      const group = groupSnap.val();

      // Delete messages & files in a single check
      if (group.messages) {
        Object.entries(group.messages).forEach(([msgId, msg]) => {
          if (msg.timestamp) {
            const age = now - msg.timestamp;
            if (msg.encryptedText && age > MESSAGE_LIFETIME) {
              groupSnap.ref.child('messages').child(msgId).remove();
              console.log("Deleted message:", msgId);
            }
            if (msg.encryptedFile && age > FILE_LIFETIME) {
              groupSnap.ref.child('messages').child(msgId).remove();
              console.log("Deleted file:", msgId);
            }
          }
        });
      }

      // Delete old users
      if (group.users) {
        Object.entries(group.users).forEach(([uid, user]) => {
          if (user.joined && now - user.joined > USER_LIFETIME) {
            groupSnap.ref.child('users').child(uid).remove();
            console.log("Deleted user:", uid);
          }
        });
      }

      // Delete old groups
      if (group.createdAt && now - group.createdAt > GROUP_LIFETIME) {
        groupSnap.ref.remove();
        console.log("Deleted group:", groupSnap.key);
      }
    });
  }).catch(err => console.error("Auto-cleanup error:", err));
}

// Run cleanup every 5 seconds for testing
setInterval(autoCleanup, 5000);
autoCleanup(); // Run immediately
