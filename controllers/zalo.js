import fetch from 'node-fetch';

async function getFollowers(accessToken) {
    let totalFollowers = [];
    let offset = 0;
    let count = 50;
    const dataRequest = `%7B%22offset%22%3A${offset}%2C%22count%22%3A${count}%7D`;

    const URL = `https://openapi.zalo.me/v2.0/oa/getfollowers?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = await response.json();

    const { total, followers } = jsonResponse.data;
    totalFollowers.push(...followers);

    while (totalFollowers.length < total) {
        offset += 50;
        count += 50;
        const dataRequest = `%7B%22offset%22%3A${offset}%2C%22count%22%3A${count}%7D`;

        const URL = `https://openapi.zalo.me/v2.0/oa/getfollowers?data=${dataRequest}`;

        const response = await fetch(URL, {
            method: 'get',
            headers: { access_token: accessToken },
        });

        const jsonResponse = await response.json();

        const { total, followers } = jsonResponse.data;

        totalFollowers.push(...followers);
    }

    let result = [];

    for (let i = 0; i < totalFollowers.length; i++) {
        const zaloUserId = totalFollowers[i].user_id;

        const userData = await getProfile(accessToken, zaloUserId);

        result.push(userData);
    }

    return result;
}

async function getProfile(accessToken, zaloUserId) {
    const dataRequest = `%7B%22user_id%22%3A%22${zaloUserId}%22%7D`;

    const URL = `https://openapi.zalo.me/v2.0/oa/getprofile?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = (await response.json()).data;

    let {
        user_gender: userGender,
        display_name: displayName,
        shared_info: shareInfo = {},
        tags_and_notes_info: tagsAndNotesInfo,
    } = jsonResponse;

    userGender === 1 ? (userGender = 'Nam') : (userGender = 'Nữ');

    const {
        address: studentId = null,
        phone: userPhone = null,
        name: aliasName = null,
    } = shareInfo;

    const { tag_names: tagsName } = tagsAndNotesInfo;

    const classId = tagsName.filter((s) => s.includes('A')) || null;

    const role = tagsName.filter((s) => s.includes('P')) || null;

    const status = tagsName.filter((s) => !s.includes(classId) && !s.includes(role)) || null;

    const result = {
        zaloUserId: zaloUserId,
        displayName: displayName,
        aliasName: aliasName,
        userGender: userGender,
        userPhone: userPhone,
        role: role[0],
        status: status[0],
        classId: classId[0],
        studentId: studentId,
    };
    return result;
}

async function updateFollowerInfo(accessToken, studentId, zaloUserId, phone, aliasName) {
    const URL = `https://openapi.zalo.me/v2.0/oa/updatefollowerinfo`;

    const data = {
        address: `${studentId}`,
        user_id: `${zaloUserId}`,
        phone: `${phone}`,
        name: `${aliasName}`,
        district_id: '009',
        city_id: '01',
    };

    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(data),
    });
}

async function sendMessage(accessToken, zaloUserId, message) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v2.0/oa/message?`;

    const content = {
        recipient: { user_id: `${zaloUserId}` },
        message: { text: `${message}` },
    };

    await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });
}

async function tagFollower(accessToken, zaloUserId, tagName) {
    const URL = `https://openapi.zalo.me/v2.0/oa/tag/tagfollower`;

    const data = { user_id: zaloUserId, tag_name: tagName };

    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(data),
    });
}

async function removeFollowerFromTag(accessToken, zaloUserId, tagName) {
    const URL = 'https://openapi.zalo.me/v2.0/oa/tag/rmfollowerfromtag';

    const data = { user_id: `${zaloUserId}`, tag_name: `${tagName}` };
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    await fetch(URL, {
        method: 'post',
        headers: headers,
        payload: JSON.stringify(data),
    });
}

async function sendReaction(accessToken, zaloUserId, messageId, action) {
    const URL = 'https://openapi.zalo.me/v2.0/oa/message';

    const action2ReactIcon = {
        heart: '/-heart',
        sad: ':-((',
        like: '/-strong',
    };

    const data = {
        recipient: {
            user_id: zaloUserId,
        },
        sender_action: {
            react_icon: action2ReactIcon[action],
            react_message_id: messageId,
        },
    };
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(data),
    });
}

export {
    getFollowers,
    getProfile,
    sendMessage,
    updateFollowerInfo,
    tagFollower,
    removeFollowerFromTag,
    sendReaction,
};
