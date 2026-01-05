import admin from "firebase-admin";

const serviceAccount = require("./skyid-4b3f0-firebase-adminsdk-fbsvc-9ba766719c.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "skyid-4b3f0.firebasestorage.app",
});

const bucket = admin.storage().bucket();

export async function uploadFile(src: string, destination: string, contentType: string) {
  try {
    const [file] = await bucket.upload(src, { destination, contentType });
    console.log(`File (${file.name}) uploaded successfully`);
    return file;
  } catch (error) {
    console.error("Error uploading file: ", error);
    throw error;
  }
}
