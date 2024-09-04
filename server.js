require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('./firebase.js');
const axios = require('axios');
const path = require('path');
const app = express();

const db = admin.firestore();

const port = 5050;

let current_course = "example_course";
let current_password = "1234";




app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3000',
  methods: 'GET, POST, PUT, DELETE',
  credentials: true, // If you're using cookies or HTTP authentication
}));
app.options('/api/createuser', cors());

app.use('/settings/home',express.static(path.join(__dirname, 'public/home')));
app.use('/settings/course',express.static(path.join(__dirname, 'public/course')));
app.use('/settings/project',express.static(path.join(__dirname, 'public/project')));

// 設置根路由
app.get('/', (req, res) => {
  res.send('Hello, World!');

});

app.get('/checkin', (req, res) => {
    const id=req.query.id;
    const code=req.query.code;
    if (code==current_password) {
        console.log(`簽到成功: ID=${id}`);
        res.send(`簽到成功: ID=${id}`);
    } else {
        res.status(400).send(`缺少 id 或 secretcode 參數`);
    }
});

app.get('/checkin/settings', (req, res) => {
    current_course=req.query.course;
    current_password=req.query.code;
    console.log(`設定成功: course=${course}`);
    res.send(`設定成功: course=${course}`);
});


app.post('/api/createuser',(req, res) => {
  console.log("Creating user...");
  try{
    const {userData, webSecret} = req.body;
    if (webSecret !== process.env.WEB_SECRET) {
      return res.status(401).send('Unauthorized terminal');
    }
    if (!userData || !userData.uid || !userData.email || !userData.displayName) {
      return res.status(400).json({ error: "Invalid user data" });
    }


    const userRef = db.collection("UserProfile").doc(userData.uid);

    const MEMBER_COURSE_STATUS = {
      Attendence:0,
      AttendenceCourseId:[],
      Qualification:false,
      CertQualification:false,
    }

    const MEMBER_PROJECT_STATUS = {
      Qualification:false,
      Joined_Projects:[
        {
          ProjectId:"",
          Project_Role:"",
          Project_Qualification_Start:null,
          Project_Qualification_End:null,
          ProjectAttendence:0,
        }
      ],
    }

    userRef.set({
      DisplayName: userData.displayName,
      Email: userData.email,
      Avatar: userData.avatar,
      uid: userData.uid,

      MemberInfo: {
        MemberType: "spectator",
        Qualification:false,
        QualificationExpiration:null,
      },

      Payment: {
        Required: 0,
        Status: false,
        Amount: 0,
        Date: null,
      },
      
      CreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      LastLogin: null,

      CourseStatus: MEMBER_COURSE_STATUS,
      ProjectStatus: MEMBER_PROJECT_STATUS,

    },{merge:false});

    console.log("User created/updated successfully");
    return res.status(200).json({ message: "User created/updated successfully" });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

});


app.get('/auth/discord/callback', async (req, res) => {

  if(req.query.error){
    console.log(req.query.error)
    return res.status(400).send('Discord 授權失敗').redirect(`${process.env.CLIENT_URL}`);
  }

  const code = req.query.code;
  const state = req.query.state; //Firebase UID


  

  const exchangeCodeForToken = async (code) => {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
    }));
  
    return tokenResponse.data.access_token;
  };

  const getUserInfo = async (accessToken) => {
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  
    return userResponse.data;
  };

  const linkDiscordAccount = async (firebaseUid, discordInfo) => {
    const userRef = db.collection('UserProfile').doc(firebaseUid);
    await userRef.set({
      discord: {
        id: discordInfo.id,
        username: discordInfo.username,
        discriminator: discordInfo.discriminator,
        avatar: discordInfo.avatar,
      },
    }, { merge: true });
  };

  try {
    const accessToken = await exchangeCodeForToken(code);
    const discordUserInfo = await getUserInfo(accessToken);

    await linkDiscordAccount(state, discordUserInfo); // add discord info to db
    setTimeout(() => {
      res.redirect(`${process.env.CLIENT_URL}`);
    }, 3000);

  } catch (error) {
    console.error('Error linking Discord account:', error);
    res.status(500).send('Error linking Discord account');
  }
});




// 啟動伺服器
app.listen(port, () => {
  console.log(`伺服器正在 http://localhost:${port} 上運行`);
});