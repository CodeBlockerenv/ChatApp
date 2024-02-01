const express =require('express');
const mongoose = require('mongoose');
const User = require('./models');
const Message = require('./messageModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const ws = require('ws');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const fs= require('fs');
const path = require('path');


const app=express();
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));
const mongo_url=process.env.MONGO_URL;
const salt=bcrypt.genSaltSync(10);
try{mongoose.connect(mongo_url);}
catch(error){
  console.log(error)
}

app.use(cors({
    credentials: true,
    origin: process.env.CLIENT_URL,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));


//get all users
app.get('/people',async (req,res)=>{
  const users = await User.find({});
  const userAr= [];
  users.forEach(user=>(
    userAr.push({_id:user._id,username:user.username})
  ))
  // console.log('userAR',userAr)
  res.json(userAr)
})

//profile api

app.get('/profile',(req,res)=>{
  const token = req.cookies?.token;
  if (token){
    jwt.verify(token,process.env.JWT_SECRET,{},(err,data)=>{
      res.json({
        username:data.username,
        id:data.id
      })
    })
  }

})

//register api

app.post('/register',async (req,res)=>{
    const {username,password} =req.body;
    const encyptpass= bcrypt.hashSync(password,salt);
    if (username){
      const userDoc= await User.create({username:username,password:encyptpass})
      jwt.sign({username:userDoc.username,id:userDoc._id},
        process.env.JWT_SECRET,{},(err,token)=>{
          res.cookie('token',token).json(userDoc);
        })
      // res.json(userDoc);
    }
    
})


//login api
app.post('/login',async (req,res)=>{
  const {username,password} =req.body;
  const userDoc = await User.findOne({username})
  console.log(userDoc.password);
  if (userDoc){
    const pass =bcrypt.compareSync(password,userDoc.password)
    if (pass){
      
      jwt.sign({username:userDoc.username,id:userDoc._id}
        ,process.env.JWT_SECRET,{},(err,token)=>{
          res.cookie('token',token).json(userDoc);
        })
    }

  }
})

//fetch all messages
app.get('/messages/:userId',async (req,res)=>{
  const userId=req.params.userId
  const {token}=req.cookies
  const jwtData= await jwt.verify(token,process.env.JWT_SECRET,{})
  const OurId=jwtData.id
  if(userId){
    const msgInfo = await Message.find({
      sender:{$in:[userId,OurId]},
      recepient:{$in:[userId,OurId]}
    }).sort({createdAt:1})
    res.json(msgInfo)
    // console.log(msgInfo)
  }
})

//logout
app.get('/logout',(req,res)=>{
  res.cookie('token', '', { expires: new Date(0) }).json('user logged out');
  
  
})

const server=app.listen(process.env.PORT,()=>{
    console.log(`port:4000 running ${process.env.CLIENT_URL}`);
})

const wss = new ws.WebSocketServer({server});


wss.on('connection',(connection,req)=>{
  console.log('web socket connection intiated');

  //sending all online clients
 function notifyAboutOnlinePeople (){
  [...wss.clients].forEach(s=>{
   s.send(JSON.stringify
    ({online:[...wss.clients].map(data=>({_id:data.userId,username:data.username}))}));
  })
}


connection.on('close', () => {
  notifyAboutOnlinePeople();
});

  connection.isAlive = true;

  connection.timer = setInterval(() => {
  connection.ping();
  connection.deathTimer = setTimeout(() => {
    connection.isAlive = false;
    clearInterval(connection.timer);
    connection.terminate();
    notifyAboutOnlinePeople();
    console.log('dead');
    }, 1000);
  }, 5000);

  connection.on('pong', () => {
    clearTimeout(connection.deathTimer);
  });

  //receive messages
  connection.on('message', async (message)=>{
    const mesg=JSON.parse(message);
    const {recepient,msg,file}= mesg;
    let filename = null;
    if (file){
      const parts = file.filename.split('.')
      const ext = parts[parts.length-1]
      filename = Date.now()+ '.'+ext
      const filepath = __dirname+ '/uploads/'+filename;
      // console.log(file.file)
      // const filecontent = Buffer.from(file.file, 'base64');
      const filecontent =Buffer.from(file.file.split(',')[1], 'base64');
      // console.log(file.file);
      fs.writeFile(filepath,filecontent,()=>{
        console.log('writing file',filepath)
      })
    }
    console.log(recepient) 
    if (recepient && (msg||file)){
      
      const msgModel = await Message.create({
        sender:connection.userId,
        recepient:recepient,
        text:msg,
        file:file?filename:null,
      })
   
    
      const clients = [...wss.clients].filter(s =>
        s.userId === recepient
      )
      clients.forEach(s => {
        s.send(JSON.stringify({msg,messageId:msgModel._id,
          sender:msgModel.sender,
          recepient:recepient,
          file:file?filename:null,
        }));
      });
    }
  
  })

  const cookies=req.headers.cookie;
  // console.log(cookies);
  if (cookies){
    const cookie = cookies.split(';').find(str=>str.startsWith('token='));
    if (cookie){
      token=cookie.split('=')[1];
      // console.log(token);
      jwt.verify(token,process.env.JWT_SECRET,{},(err,data)=>{
        connection.userId=data?.id;
        connection.username=data?.username;
      })
    }
  }

  notifyAboutOnlinePeople();
})

