require('dotenv').config();
const mongoose = require('mongoose');

console.log('\n🔍 Testing MongoDB ATLAS Connection...\n');

if (!process.env.MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI is not set in .env file');
  console.error('💡 Make sure your .env file exists and contains MONGODB_URI');
  process.exit(1);
}

// Hide password in logs
const safeConnectionString = process.env.MONGODB_URI.replace(/:[^:@]+@/, ':****@');

console.log('📝 Connection string:', safeConnectionString);
console.log('📍 Attempting to connect to MongoDB Atlas...\n');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ SUCCESS! MongoDB Atlas Connected');
    console.log('📦 Database name:', mongoose.connection.name);
    console.log('🌐 Host:', mongoose.connection.host);
    console.log('✨ Your cloud database is ready!');
    console.log('\n🎯 Next step: Run npm start\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ FAILED! Connection Error\n');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    
    if (error.message.includes('bad auth')) {
      console.error('\n💡 SOLUTION: Create database user in MongoDB Atlas');
      console.error('   1. Go to https://cloud.mongodb.com');
      console.error('   2. Database Access → Add New Database User');
      console.error('   3. Username: mamanalgeriennepartenariat_db_user');
      console.error('   4. Password: anesaya75');
      console.error('   5. Role: Atlas admin');
      console.error('   6. Network Access → Add IP: 0.0.0.0/0');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 SOLUTION: Check your internet connection and cluster URL');
    } else {
      console.error('\n💡 See FIX-MONGODB-AUTH-ERROR.md for detailed troubleshooting');
    }
    console.error('');
    process.exit(1);
  });
