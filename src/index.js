require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('./firebase_admin.js');
const axios = require('axios');
const path = require('path');
const app = express();
const functions = require('firebase-functions');



const WEB_SECRET = functions.config().web.web_secret ;
const DISCORD_CLIENT_ID = functions.config().web.discord_client_id;
const DISCORD_SECRET = functions.config().web.discord_secret ;
const DISCORD_REDIRECT_URI = functions.config().web.discord_redirect_uri ;
const CLIENT_URL = functions.config().web.client_url ;

const db = admin.firestore();

let current_course = "example_course";
let current_password = "1234";




app.use(express.json());
app.use(cors({
	origin: ['http://localhost:3000','https://gdsc-web-2d5fa.firebaseapp.com','https://gdsc-web-2d5fa.web.app'],
	methods: 'GET, POST, PUT, DELETE',
	credentials: true, // If you're using cookies or HTTP authentication
}));
app.options('*', cors());

app.use('/settings/home',express.static(path.join(__dirname, './pages/home')));
app.use('/settings/course',express.static(path.join(__dirname, './pages/course')));
app.use('/settings/project',express.static(path.join(__dirname, './pages/project')));

// 設置根路由
app.get('/', (req, res) => {
	res.send('Hello, World!');
	console.log("Root has been visited");
});

app.post('/checkin', async(req, res) => {
  const userId=req.query.user;
  const courseId = req.query.course;
  const code=req.query.code;

  const userIdPattern = /^[a-zA-Z0-9]+$/;

  if(!userIdPattern.test(userId)){
    return res.status(400).send(`使用者ID格式錯誤`);
  }
  
	if (code==current_password && courseId==current_course && userId) {
      	// 如果簽到單中已經有該使用者的 ID，則不再重複簽到
        const checkinSheet = await admin.firestore().collection("attendence_sheet").doc(courseId).get();
        const userDoc = await admin.firestore().collection("UserProfile").doc(userId).get();
        if (checkinSheet.data().checkin.includes(userId) || userDoc.data().CourseStatus.AttendenceCourseId.includes(courseId)) {
            return res.status(400).send(`使用者 ${userId} 已經簽到過`);
        }else{
          await admin.firestore().collection("attendence_sheet").doc(courseId).update({
            ['checkin']: admin.firestore.FieldValue.arrayUnion(userId),
          });
          await admin.firestore().collection("UserProfile").doc(userId).update({
              ['CourseStatus.Attendence']: admin.firestore.FieldValue.increment(1),
              ['CourseStatus.AttendenceCourseId']: admin.firestore.FieldValue.arrayUnion(courseId),
          });
          res.status(200).send(`使用者 ${userId} 簽到成功`);
        }
        
    } else {
        res.status(400).send(`缺少 id 或 secretcode 參數`);
    }
});

app.post('/checkin/settings', async(req, res) => {
  current_course=req.query.course;
  current_password=req.query.code;
  console.log(`設定成功: course=${current_course}`);
  
  try{
    const courseDoc = await admin.firestore().collection("attendence_sheet").doc(current_course).get();
  
    if(courseDoc.exists){
      return res.send(`ID:${current_course} 課程已連結，code = ${current_password}`);
    }else{
      await admin.firestore().collection("attendence_sheet").doc(current_course).set({
        checkin:[],
      });
      return res.send(`ID:${current_course} 課程簽到表創建成功`);
    }
  }catch(error){
    return res.send(`ID:${current_course} 課程簽到表創建失敗`);
  }
});


app.post('/createuser',async (req, res) => {
  console.log("Creating user...");
  try{
    const userData = req.body.userData;
    const clientWebSecret = req.body.webSecret;
    if (clientWebSecret !== WEB_SECRET) {
      console.log("Unauthorized terminal");
      console.log("Client secret:"+clientWebSecret+" \nServer secret:"+WEB_SECRET);
      console.log(req.body);
      return res.status(401).send('Unauthorized terminal');
    }
    if (!userData || !userData.uid || !userData.email || !userData.displayName) {
      console.log("Invalid user data");
      return res.status(400).json({ error: "Invalid user data" });
    }

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

    await admin.firestore().collection("UserProfile").doc(userData.uid).set({
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
        Required: 100,
        Status: false,
        Amount: 0,
        Date: null,
      },
      
      CreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      LastLogin: admin.firestore.FieldValue.serverTimestamp(),

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

app.post('/payment', async (req, res) => {
  const userId = req.query.user;
  const clientWebSecret = req.body.code;

  if(clientWebSecret !== WEB_SECRET){
    return res.status(401).send('Unauthorized terminal');
  }


  const userRef = db.collection('UserProfile').doc(userId);
  await admin.firestore().collection("UserProfile").doc(userId).update({
    ['MemberInfo.MemberType']: "member",
    ['MemberInfo.Qualification']: true,
    ['MemberInfo.QualificationExpiration']: admin.firestore.Timestamp.fromDate(new Date(2025, 1, 31)),
  });

  await admin.firestore().collection("UserProfile").doc(userId).update({
    ['Payment.Status']: true,
    ['Payment.Amount']: 100,
    ['Payment.Date']: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  return res.status(200).send(`使用者 ${userRef.DisplayName} 付款成功`);
});

app.get('/auth/discord/callback', async (req, res) => {

  if(req.query.error){
    console.log(req.query.error)
    res.status(400).send(`Discord 授權失敗 正在回到 ${CLIENT_URL}`);
  }

  const code = req.query.code;
  const state = req.query.state; //Firebase UID
  const exchangeCodeForToken = async (code) => {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: DISCORD_REDIRECT_URI,
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
      Discord: {
        UserId: discordInfo.id,
        UserName: discordInfo.username,
        Discriminator: discordInfo.discriminator,
        Avatar: discordInfo.avatar,
      },
    }, { merge: true });
  };

  try {
    const accessToken = await exchangeCodeForToken(code);
    const discordUserInfo = await getUserInfo(accessToken);

    await linkDiscordAccount(state, discordUserInfo); // add discord info to db
    res.redirect(CLIENT_URL);    

  } catch (error) {
    console.error('Error linking Discord account:', error);
    res.status(500).send('Error linking Discord account');
  }
});

app.post('/auth/discord/refreshrole', async (req, res) => {
  res.status(200).send('Discord refresh has not been implemented yet');
  // 下次繼續!!!，刷新discord 身分組

});


exports.api = functions.https.onRequest(app);