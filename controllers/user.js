import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

// async function insertToZaloDB() {
//     try {
//         await MongoDB.client.connect();
//         const db = MongoDB.client.db('zalo_servers');
//         const tokenColl = db.collection('tokens');
//         const zaloColl = db.collection('zaloUsers');

//         const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

//         const followers = await ZaloAPI.getFollowers(accessToken);

//         // console.log(followers);
//         // return;

//         await MongoDB.insertManyToDB(zaloColl, followers);

//         console.log('Success!');
//     } catch (err) {
//         console.error(err);
//     } finally {
//     }
// }

// insertToZaloDB();

export const userRequest = async (req, res) => {
    const webhook = req.body;
    const eventName = webhook.event_name;
    const unixTimestamp = parseInt(webhook.timestamp);
    const localeTimeStamp = new Date(unixTimestamp).toLocaleString('vi-VN');

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');
        const managerColl = db.collection('managers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        let zaloUserId;

        if (eventName === 'user_click_chatnow') {
            zaloUserId = webhook.user_id;

            await Tools.isFollow(res, accessToken, refreshToken, zaloUserId, zaloColl, tokenColl);
        } else if (eventName === 'follow') {
            zaloUserId = webhook.follower.id;

            const isExistInZaloColl = await MongoDB.findOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { projection: { _id: 0, displayName: 1 } }
            );

            if (isExistInZaloColl === null) {
                const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);
                console.log(`${profileDoc.displayName} quan tâm OA (${profileDoc.zaloUserId})`);

                MongoDB.insertOneUser(zaloColl, profileDoc);

                MongoDB.updateTokenInDB(tokenColl, refreshToken);
            } else {
                MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: `${zaloUserId}` },
                    { $set: { status: 'follow' } }
                );

                console.log('Nguời dùng quan tâm trở lại');
            }

            res.send('Done!');
        } else if (eventName === 'unfollow') {
            zaloUserId = webhook.follower.id;

            MongoDB.updateOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { $set: { status: 'unfollow' } }
            );
            console.log('Người dùng bỏ quan tâm OA');
        } else if (eventName === 'user_reacted_message') {
            // Check xem tha tym den OA co tu phia Tro giang khong
            zaloUserId = webhook.sender.id;

            if (!(await Tools.isManager(res, zaloUserId, managerColl))) {
                res.send('Done!');
                return;
            } else {
                // Neu tu phia tro giang thi chuyen tiep tym lai cho phu huynh
                const reactMessageId = webhook.message.msg_id;

                const reactIcon = webhook.message.react_icon;

                console.log(reactIcon);

                await Tools.sendReactBack2Parent(
                    tokenColl,
                    refreshToken,
                    accessToken,
                    zaloUserId,
                    reactMessageId,
                    reactIcon
                );

                return;
            }
        } else if (eventName === 'user_send_text') {
            zaloUserId = webhook.sender.id;

            const messageId = webhook.message.msg_id;
            const content = webhook.message.text;

            const formatContent = Tools.nomarlizeSyntax(content);

            // Check xem nguoi dung da follow OA chua
            if (!(await Tools.isFollow(res, accessToken, refreshToken, zaloUserId, zaloColl, tokenColl))) {
                return;
            }

            if (formatContent.includes('dkph')) {
                Tools.signUp(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    tokenColl,
                    formatContent,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatContent.includes('dkhs')) {
                Tools.signUp(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    tokenColl,
                    formatContent,
                    messageId,
                    'Học sinh'
                );
            } else if (formatContent.includes('dktg')) {
                Tools.signUp4Assistant(
                    res,
                    accessToken,
                    refreshToken,
                    zaloUserId,
                    managerColl,
                    tokenColl,
                    content,
                    messageId
                );
            } else if (!formatContent.includes('#')) {
                // Check xem tin nhan den OA co tu phia Tro giang khong

                if (!(await Tools.isManager(res, zaloUserId, managerColl))) {
                    Tools.forwardMessage2Assistant(
                        res,
                        accessToken,
                        refreshToken,
                        zaloUserId,
                        messageId,
                        zaloColl,
                        managerColl,
                        tokenColl,
                        content,
                        localeTimeStamp
                    );
                } else {
                    // Neu tu phia tro giang thi phan hoi lai cho phu huynh
                    const quoteMessageId = webhook.message.quote_msg_id || null;

                    if (quoteMessageId !== null) {
                        const replyContent = webhook.message.text;

                        await Tools.sendMessageBack2Parent(
                            res,
                            accessToken,
                            refreshToken,
                            zaloUserId,
                            tokenColl,
                            replyContent,
                            quoteMessageId
                        );
                    } else {
                        res.send('Done!');
                        return;
                    }
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
    }
};
