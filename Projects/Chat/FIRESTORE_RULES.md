# Firestore rules for readable Chat IDs

The Chat app registers each user's readable Chat ID (`google-you@gmail.com`, `github-YourName`,
`email-you@example.com`) in the `chatIds` collection: document id = the lower-cased Chat ID,
fields `{ uid, provider, claimedAt }`. DMs resolve the alias to that `uid` and then use the owner's existing
inbox room (`chatRooms/<uid>`), so nothing about rooms, groups or existing chats changes.

Add this block inside `match /databases/{database}/documents { ... }` in the Firebase console
(Firestore Database → Rules), next to your existing rules:

```
match /chatIds/{id} {
  // anyone signed in can resolve a Chat ID to a user
  allow read: if request.auth != null;

  // an ID can be claimed once, only for yourself, and only if it matches how you signed in
  allow create: if request.auth != null
    && request.resource.data.keys().hasOnly(['uid', 'provider', 'claimedAt'])
    && request.resource.data.uid == request.auth.uid
    && (
      (request.resource.data.provider == 'google.com'
        && request.auth.token.firebase.sign_in_provider == 'google.com'
        && request.auth.token.email_verified == true
        && id == 'google-' + request.auth.token.email.lower())
      ||
      (request.resource.data.provider == 'password'
        && request.auth.token.firebase.sign_in_provider == 'password'
        && request.auth.token.email_verified == true
        && id == 'email-' + request.auth.token.email.lower())
      ||
      (request.resource.data.provider == 'github.com'
        && request.auth.token.firebase.sign_in_provider == 'github.com'
        && id.matches('github-.+'))
    );

  allow update, delete: if false;
}
```

Notes

* Google and email IDs are enforced by the rules (verified email must match the ID). Firebase tokens do not carry the
  GitHub username, so rules cannot check it: a `github-…` ID is first come, first served among GitHub-signed-in users.
* Until these rules are deployed the app keeps working and shows the account ID (UID) instead of a readable ID.
* These rules have not been run against the Firestore emulator.
