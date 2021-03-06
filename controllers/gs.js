import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
import { google } from 'googleapis';

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCOPE = process.env.SCOPE;
const client = new google.auth.JWT(CLIENT_EMAIL, null, PRIVATE_KEY, [SCOPE]);

export const createMockMessageFromClassId = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const classInfoColl = db.collection('classInfo');

        const { sourceId, sheetName, classId, role } = data;

        const result = await classInfoColl.findOne(
            { classId: classId },
            { projection: { _id: 0, assistants: 1, className: 1 } }
        );

        const { className, assistants } = result;
        const { taName, taZaloId } = assistants[0];

        const zaloList = [[1, taZaloId, taName, 'Nguyễn Văn An', role, 2000999, classId, className]];

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const sendBulk = async (req, res) => {
    const data = req.body;

    const { sourceId, sheetName, lastCol, lastRow, template } = data;

    try {
        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                sendMessageBulk(client, sourceId, sheetName, lastCol, lastRow, template);
            }
        });

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getIncludeUser = async (req, res) => {
    const data = req.body;
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');
        const classInfoColl = db.collection('classInfo');

        const { sourceId, sheetName, studentIds, role } = data;

        let zaloList = [];

        for (let i = 0; i < studentIds.length; i++) {
            const studentId = studentIds[i];

            const pipeline = [
                { $match: { 'students.zaloStudentId': parseInt(studentId) } },
                {
                    $project: {
                        _id: 0,
                        zaloUserId: 1,
                        displayName: 1,
                        userPhone: 1,
                        students: {
                            $filter: {
                                input: '$students',
                                as: 'item',
                                cond: {
                                    $and: [
                                        { $eq: ['$$item.zaloStudentId', parseInt(studentId)] },
                                        { $eq: ['$$item.role', role] },
                                    ],
                                },
                            },
                        },
                    },
                },
            ];

            const aggCursor = zaloColl.aggregate(pipeline);

            const result = await aggCursor.toArray();

            if (result.length === 0) continue; // Neu hoc sinh khong co tren CSDL

            for (let i = 0; i < result.length; i++) {
                const { zaloUserId, displayName, userPhone, students } = result[i];

                for (let v = 0; v < students.length; v++) {
                    const { zaloStudentId, zaloClassId, aliasName, role } = students[v];
                    const studentName = aliasName.slice(3);

                    const resutlClassId = await MongoDB.findOneUser(
                        classInfoColl,
                        { classId: zaloClassId },
                        { projection: { _id: 0, className: 1 } }
                    );

                    if (resutlClassId === null) continue;
                    const { className } = resutlClassId;

                    zaloList.push([
                        zaloUserId,
                        displayName,
                        studentName,
                        role,
                        zaloStudentId,
                        zaloClassId,
                        className,
                    ]);
                }
            }
        }

        zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getNotPaymentUserFromClassId = async (req, res) => {
    const data = req.body;
    const { sourceId, sheetName, classId } = data;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const classInfoColl = db.collection('classInfo');
        const studentInfoColl = db.collection('studentInfo');

        const { currentTerm } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1 } }
        );

        const studentNotPayment = await Tools.listStudentNotPayment(classId, currentTerm, studentInfoColl);

        let zaloList = [];

        studentNotPayment.forEach((v, i) => {
            const { studentId, studentName, terms } = v;

            const { billing } = terms[0];

            const formatBilling = Tools.formatCurrency(billing);

            zaloList.push([i + 1, '', '', studentName, formatBilling, studentId, '', '']);
        });

        // Tra ve sheet cho tro giang
        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getNotRegisterFromAdmin = async (req, res) => {
    const data = req.body;

    await MongoDB.client.connect();
    const db = MongoDB.client.db('zalo_servers');
    const zaloColl = db.collection('zaloUsers');
    const classColl = db.collection('classUsers');

    const { sourceId, sheetName, classIds, status, role } = data;

    let classCheckList = [];
    if (status === 'Đang học') {
        classCheckList = [...classIds];
    } else {
        classIds.forEach((v) => classCheckList.push([`N${v[0]}`, v[1]]));
    }

    let zaloList = [];

    for (let i = 0; i < classCheckList.length; i++) {
        const [classId, className] = classCheckList[i];

        const cursorRegister = zaloColl.find(
            { 'students.zaloClassId': classId, 'students.role': role },
            { projection: { _id: 0, students: 1, displayName: 1, userPhone: 1 } }
        );

        let registers = [];

        const resultRegister = await cursorRegister.toArray();

        // Lay danh sach hoc sinh dang hoc tai lop
        const cursorStudents = classColl.find(
            { classId: classId },
            { projection: { _id: 0, studentId: 1, fullName: 1 } }
        );

        let studentLists = [];

        await cursorStudents.forEach((v) => {
            const { studentId, fullName } = v;

            studentLists.push([studentId, fullName]);
        });

        // Lay danh sach hoc sinh da co phu huynh dang ki lop xx (Dang hoc)
        resultRegister.forEach((v) => {
            const { displayName, userPhone, students } = v;

            students.forEach((e) => {
                const { zaloStudentId, zaloClassId, aliasName } = e;

                if (zaloClassId === classId) {
                    registers.push(zaloStudentId);
                }
            });
        });

        // Loc ra danh sach hoc sinh chua co phu huynh dang ki
        const notRegisters = studentLists.filter((v) => !registers.includes(v[0]));

        notRegisters.forEach((v) => {
            const [studentId, fullName] = v;

            zaloList.push(['', '', fullName, role, studentId, '', '']);
        });
    }

    zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

    // Tra ve sheet cho Admin
    client.authorize((err) => {
        if (err) {
            console.error(err);
            return;
        } else {
            getUserBulk(client, sourceId, sheetName, zaloList);
        }
    });

    res.send('Done!');
};

export const getNotRegisterFromClassId = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const { sourceId, sheetName, classId, role } = data;

        const cursorRegister = zaloColl.find(
            { 'students.zaloClassId': classId, 'students.role': role },
            { projection: { _id: 0, students: 1, displayName: 1, userPhone: 1 } }
        );

        let registers = [];

        const resultRegister = await cursorRegister.toArray();

        // Lay danh sach hoc sinh dang hoc tai lop
        const cursorStudents = classColl.find(
            { classId: classId },
            { projection: { _id: 0, studentId: 1, fullName: 1 } }
        );

        let studentLists = [];

        await cursorStudents.forEach((v) => {
            const { studentId, fullName } = v;

            studentLists.push([studentId, fullName]);
        });

        // Lay danh sach hoc sinh da co phu huynh dang ki lop xx (Dang hoc)
        resultRegister.forEach((v) => {
            const { displayName, userPhone, students } = v;

            students.forEach((e) => {
                const { zaloStudentId, zaloClassId, aliasName } = e;

                if (zaloClassId === classId) {
                    registers.push(zaloStudentId);
                }
            });
        });

        // Loc ra danh sach hoc sinh chua co phu huynh dang ki
        const notRegisters = studentLists.filter((v) => !registers.includes(v[0]));

        let zaloList = [];

        notRegisters.forEach((v, i) => {
            const [studentId, fullName] = v;

            zaloList.push([i + 1, '', '', fullName, role, studentId, '', '']);
        });

        // Tra ve sheet cho tro giang
        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getSeekInfoFromAdmin = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');

        const { sourceId, sheetName } = data;

        let zaloList = [];

        const result = zaloColl.find(
            { userPhone: null },
            { projection: { _id: 0, zaloUserId: 1, displayName: 1 } }
        );

        const seekInfoList = await result.toArray();

        seekInfoList.forEach((v, i) => {
            const { zaloUserId, displayName } = v;

            zaloList.push([i + 1, zaloUserId, displayName]);
        });

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getListUserFromClassId = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');
        const classInfoColl = db.collection('classInfo');

        const { sourceId, sheetName, classId, role } = data;

        const { className } = await classInfoColl.findOne(
            { classId: classId },
            { projection: { _id: 0, className: 1 } }
        );

        let zaloList = [];

        const pipeline = [
            { $match: { 'students.zaloClassId': classId } },
            {
                $project: {
                    _id: 0,
                    zaloUserId: 1,
                    displayName: 1,
                    userPhone: 1,
                    students: {
                        $filter: {
                            input: '$students',
                            as: 'item',
                            cond: {
                                $and: [
                                    { $eq: ['$$item.zaloClassId', classId] },
                                    { $eq: ['$$item.role', role] },
                                ],
                            },
                        },
                    },
                },
            },
        ];

        const aggCursor = zaloColl.aggregate(pipeline);

        const result = await aggCursor.toArray();

        result.forEach((v) => {
            const { zaloUserId, displayName, userPhone, students } = v;
            students.forEach((e) => {
                const { zaloStudentId, zaloClassId, aliasName, role } = e;
                const studentName = aliasName.slice(3);

                zaloList.push([
                    zaloUserId,
                    displayName,
                    studentName,
                    role,
                    zaloStudentId,
                    zaloClassId,
                    className,
                ]);
            });
        });

        zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getListUserFromAdmin = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');

        const { sourceId, sheetName, classIds, status, role } = data;

        let classCheckList = [];
        if (status === 'Đang học') {
            classCheckList = [...classIds];
        } else {
            classIds.forEach((v) => classCheckList.push([`N${v[0]}`, v[1]]));
        }

        let zaloList = [];

        for (let i = 0; i < classCheckList.length; i++) {
            const [classId, className] = classCheckList[i];

            const pipeline = [
                { $match: { 'students.zaloClassId': classId } },
                {
                    $project: {
                        _id: 0,
                        zaloUserId: 1,
                        displayName: 1,
                        userPhone: 1,
                        students: {
                            $filter: {
                                input: '$students',
                                as: 'item',
                                cond: {
                                    $and: [
                                        { $eq: ['$$item.zaloClassId', classId] },
                                        { $eq: ['$$item.role', role] },
                                    ],
                                },
                            },
                        },
                    },
                },
            ];

            const aggCursor = zaloColl.aggregate(pipeline);

            const result = await aggCursor.toArray();

            if (result.length === 0) continue; // Neu ma lop khong co tren CSDL

            result.forEach((v) => {
                const { zaloUserId, displayName, userPhone, students } = v;
                students.forEach((e) => {
                    const { zaloStudentId, zaloClassId, aliasName, role } = e;
                    const studentName = aliasName.slice(3);

                    // zaloList.push({
                    //     zaloUserId: zaloUserId,
                    //     displayName: displayName,
                    //     role: role,
                    //     studentId: zaloStudentId,
                    //     studentName: studentName,
                    //     classId: zaloClassId,
                    //     className: className,
                    // });

                    zaloList.push([
                        zaloUserId,
                        displayName,
                        studentName,
                        role,
                        zaloStudentId,
                        zaloClassId,
                        className,
                    ]);
                });
            });
        }

        zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function sendMessageBulk(client, sourceId, sheetName, lastCol, lastRow, template) {
    const sheets = google.sheets({ version: 'v4', auth: client });

    const requestData = {
        spreadsheetId: sourceId,
        range: `${sheetName}!R7C1:R${lastRow}C${lastCol}`,
    };

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        const responseData = (await sheets.spreadsheets.values.get(requestData)).data;
        const data = responseData.values;
        const heads = data.shift();

        const obj = data.map((r) => heads.reduce((o, k, i) => ((o[k] = r[i] || ''), o), {}));
        // Creates an array to record sent zalo message
        const out = [];

        // Loops through all the rows of data
        for (let i = 0; i < obj.length; i++) {
            const row = obj[i];
            const zaloUserId = row['{ZID}'];

            const content = fillInTemplateFromObject(template, row);

            const result = await ZaloAPI.sendMessage(accessToken, zaloUserId, content);

            result.error === 0 ? out.push([result.message]) : out.push([result.message]);
        }

        const requestUpdate = {
            spreadsheetId: sourceId,
            range: `${sheetName}!I8:I${8 + out.length - 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                majorDimension: 'ROWS',
                values: out,
            },
        };

        const responseUpdate = (await sheets.spreadsheets.values.update(requestUpdate)).data;

        console.log(responseUpdate);
    } catch (err) {
        console.error(err);
    }
}

async function getUserBulk(client, sourceId, sheetName, zaloList) {
    const sheets = google.sheets({ version: 'v4', auth: client });

    const totalList = zaloList.length;

    const requestClear = { spreadsheetId: sourceId, range: `${sheetName}!A8:Z` };

    const requestUpdate = {
        spreadsheetId: sourceId,
        range: `${sheetName}!A8:H${8 + totalList - 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            majorDimension: 'ROWS',
            values: zaloList,
        },
    };

    try {
        const responseClear = (await sheets.spreadsheets.values.clear(requestClear)).data;

        const responseUpdate = (await sheets.spreadsheets.values.update(requestUpdate)).data;

        console.log(responseClear);
        console.log(responseUpdate);
    } catch (err) {
        console.error(err);
    }
}

// Fill template string with data object
function fillInTemplateFromObject(template, data) {
    let template_string = JSON.stringify(template);

    // Token replacement
    template_string = template_string.replace(/{[^{}]+}/g, (key) => {
        return escapeData(data[key.replace(/[]+/g, '')] || '');
    });
    return JSON.parse(template_string);
}
// Escape cell data to make JSON safe
function escapeData(str) {
    return str
        .replace(/[\\]/g, '\\\\')
        .replace(/[\"]/g, '\\"')
        .replace(/[\/]/g, '\\/')
        .replace(/[\b]/g, '\\b')
        .replace(/[\f]/g, '\\f')
        .replace(/[\n]/g, '\\n')
        .replace(/[\r]/g, '\\r')
        .replace(/[\t]/g, '\\t');
}
