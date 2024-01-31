const mongoose = require('mongoose');


const userSchema =new mongoose.Schema({
    username:{type:String,Unique:true},
    password:String
},{timestamps:true});

 const UserModel = mongoose.model('User',userSchema);
 module.exports=UserModel;
