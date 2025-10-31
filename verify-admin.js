const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://musicvt2000_db_user:anesaya75@cluster0.sihzuu5.mongodb.net/maman-algerienne?retryWrites=true&w=majority&appName=Cluster0';

// User Schema (must match server.js)
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Admin credentials
const ADMIN_PHONE = '+213555123456';
const ADMIN_PASSWORD = 'anesaya';

console.log('🔍 Verifying Admin User...\n');

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    console.log('📍 Database: maman-algerienne\n');

    // Check if admin exists
    let adminUser = await User.findOne({ phoneNumber: ADMIN_PHONE });

    if (!adminUser) {
      console.log('❌ Admin user not found! Creating admin user...\n');
      
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      adminUser = new User({
        fullName: 'المسؤول',
        phoneNumber: ADMIN_PHONE,
        password: hashedPassword,
        isAdmin: true
      });
      
      await adminUser.save();
      console.log('✅ Admin user created successfully!\n');
      console.log('📱 Phone: ' + ADMIN_PHONE);
      console.log('🔑 Password: ' + ADMIN_PASSWORD);
      console.log('🔐 isAdmin: ' + adminUser.isAdmin);
      console.log('\n🎯 You can now login and access /admin page');
    } else {
      console.log('✅ Admin user found!\n');
      console.log('📱 Phone: ' + adminUser.phoneNumber);
      console.log('👤 Name: ' + adminUser.fullName);
      console.log('🔐 isAdmin: ' + adminUser.isAdmin);
      console.log('📅 Created: ' + adminUser.createdAt);
      
      if (!adminUser.isAdmin) {
        console.log('\n⚠️  WARNING: isAdmin flag is false!');
        console.log('💡 Fixing this now...\n');
        
        adminUser.isAdmin = true;
        await adminUser.save();
        
        console.log('✅ Admin flag updated to true!');
        console.log('🔐 isAdmin: ' + adminUser.isAdmin);
      }
      
      console.log('\n🎯 You should be able to access /admin page');
      console.log('\n📝 Login credentials:');
      console.log('   Phone: +213555123456');
      console.log('   Password: anesaya');
    }
    
    console.log('');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Connection Error:', error.message);
    process.exit(1);
  });
