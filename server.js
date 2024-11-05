if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}
// file
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });
// other
const express = require('express')
const app = express()
const { spawn } = require('child_process');
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const methodOverride = require('method-override')
const User = require('./models/user.js')
const { render } = require('ejs')
let alert = require('alert');
const admin = require('firebase-admin');
const serviceAccount = require(process.env.firebaseSecret);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const auth = admin.auth();
mongoose.set('strictQuery', false);
const connect = async () => {
    try {
        await mongoose.connect(process.env.dbURI);
        console.log("Connected to database")
    } catch (error) {
        console.log("Error connecting to the database", error)
    }
};


app.set("view-engine", "ejs");
app.use(express.static(__dirname + '/public'));
console.log(__dirname);
app.use(express.urlencoded({ extended: false }));
app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

const LocalStrategy = require('passport-local').Strategy
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, function (email, password, done) {
    User.findOne({ email: email }, function (err, user) {
        if (user == null) {
            return done(null, false, { message: 'No user with that email' })
        }
        bcrypt.compare(password, user.password, function (err, res) {
            if (err) return done(err);
            if (res === false) return done(null, false, { message: 'Incorrect password.' });

            return done(null, user);
        });
    });
}));

passport.serializeUser((user, done) => done(null, user.id))
passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    })
})

const db = admin.firestore();


app.get("/", noAdmin, function (request, response) {
    response.render("index.ejs", { isUserLoggedIn: request.isAuthenticated() });
});

app.get("/logIn", checkAuthenticated, function (request, response) {
    response.render("logIn.ejs")
});
app.get("/Admin", isAdmin, async function (request, response) {
    try {
        const collectionListRef = admin.firestore().collection("collectionList");
        const driversRef = admin.firestore().collection("drivers");

        let numberOfDrivers = 0;
        let numberOfDeliveries = 0;
        let pendingCount = 0;
        let doneCount = 0;
        let cancelledCount = 0;
        let driversWithNoneAssignment = 0;

        const driversSnapshot = await driversRef.get();
        numberOfDrivers = driversSnapshot.size;

        driversSnapshot.forEach(doc => {
            const assignment = doc.data().assignment;
            if (assignment === "none") {
                driversWithNoneAssignment++;
            }
        });

        const collectionListSnapshot = await collectionListRef.get();
        
        const promises = [];
        collectionListSnapshot.forEach(doc => {
            const collectionName = doc.id;
            promises.push(getCollectionData(collectionName));
        });

        // Wait for all promises to resolve
        const countsAndStatuses = await Promise.all(promises);

        countsAndStatuses.forEach(({ count, statuses }) => {
            numberOfDeliveries += count;
            pendingCount += countOccurrences(statuses, "pending");
            doneCount += countOccurrences(statuses, "done");
            cancelledCount += countOccurrences(statuses, "cancelled");
        });

        response.render("Admin.ejs", { 
            numberOfDrivers, 
            numberOfDeliveries,
            pendingCount,
            doneCount,
            cancelledCount,
            driversWithNoneAssignment
        });
    } catch (error) {
        console.error("Error:", error);
    }
});

async function getCollectionData(collectionName) {
    const collectionRef = admin.firestore().collection(collectionName);
    const snapshot = await collectionRef.get();
    const count = snapshot.size;

    // Extract status field from each document
    const statuses = [];
    snapshot.forEach(doc => {
        const status = doc.data().status;
        if (status) {
            statuses.push(status);
        }
    });

    return { count, statuses };
}

function countOccurrences(array, value) {
    return array.filter(item => item === value).length;
}




async function countDocumentsInCollection(collectionName) {
    const collectionRef = admin.firestore().collection(collectionName);
    const snapshot = await collectionRef.get();
    return snapshot.size;
  }
app.get("/SignUp", isAdmin, function (request, response) {
    response.render("SignUp.ejs");
});
app.get("/Misc/About", function (request, response) {
    response.render("Misc/About.ejs");
});
app.get("/Misc/Careers", function (request, response) {
    response.render("Misc/Careers.ejs")
});
app.get("/Misc/CustomerSupport", function (request, response) {
    response.render("Misc/CustomerSupport.ejs")
});



/*

DRIVER MANAGMENT START

*/

/* Add driver page */
app.get("/Driver/addDriver", isAdmin, function (request, response) {
    response.render("Driver/addDriver.ejs");
});

app.post("/addDriver", async function (request, response) {
    const email = request.body.driverEmail;
    const password = request.body.driverPass;
    const mobile = request.body.driverMobile;
    const name = request.body.driverName;
    try {
        const userRecord = await auth.createUser({
            email: email,
            password: password
        })
        await db.collection("drivers").doc(userRecord.uid).set({
            Mobile: mobile,
            name: name,
            Email: email,
            car: "",
            UID: userRecord.uid,
            oil_Change: "",
            assignment: "none",
        });

        response.redirect("/Driver/addDriver");
        alert("Driver added successfully");
    } catch (error) {
        console.error("Error adding driver:", error.message);
        response.redirect("/Driver/addDriver");
        alert("Error adding driver: " + error.message);
    }
});


/* Searching a driver */
app.get("/Driver/searchDrivers", isAdmin, async function (request, response) {
    try {
        const searchTerm = request.query.search;
        let driversSnapshot;

        if (searchTerm) {
            driversSnapshot = await db.collection("drivers")
                .where("name", "==", searchTerm)
                .get();

            const emailSnapshot = await db.collection("drivers")
                .where("Email", "==", searchTerm)
                .get();

            const uidSnapshot = await db.collection("drivers")
                .where("UID", "==", searchTerm)
                .get();

            const drivers = [];
            driversSnapshot.forEach((doc) => {
                const driverData = doc.data();
                const { UID, name, Email, Mobile, car, assignment } = driverData;
                drivers.push({ UID, name, Email, Mobile, car, assignment });
            });
            emailSnapshot.forEach((doc) => {
                const driverData = doc.data();
                const { UID, name, Email, Mobile, car, assignment } = driverData;
                if (!drivers.some(driver => driver.UID === UID)) {
                    drivers.push({ UID, name, Email, Mobile, car, assignment });
                }
            });
            uidSnapshot.forEach((doc) => {
                const driverData = doc.data();
                const { UID, name, Email, Mobile, car, assignment } = driverData;
                if (!drivers.some(driver => driver.UID === UID)) {
                    drivers.push({ UID, name, Email, Mobile, car, assignment });
                }
            });

            const collectionListSnapshot = await db.collection("collectionList").get();
            let documentNames = [];
            collectionListSnapshot.forEach((doc) => {
                documentNames.push(doc.id);
            });
            response.render("Driver/viewDrivers.ejs", { drivers, documentNames });
        } else {
            // If the search term is empty, retrieve all documents in the "drivers" collection
            driversSnapshot = await db.collection("drivers").get();
            const drivers = [];
            driversSnapshot.forEach((doc) => {
                const driverData = doc.data();
                const { UID, name, Email, Mobile, car, assignment } = driverData;
                drivers.push({ UID, name, Email, Mobile, car, assignment });
            });

            const collectionListSnapshot = await db.collection("collectionList").get();
            let documentNames = [];
            collectionListSnapshot.forEach((doc) => {
                documentNames.push(doc.id);
            });
            response.render("Driver/viewDrivers.ejs", { drivers, documentNames });
        }
    } catch (error) {
        console.error("Error searching drivers:", error);
    }
});


/* View drivers normal view */
app.get("/Driver/viewDrivers", isAdmin, async function (request, response) {
    try {
        const driversSnapshot = await db.collection("drivers").get();
        const drivers = [];
        driversSnapshot.forEach((doc) => {
            const driverData = doc.data();
            const { UID, name, Email, Mobile, car, assignment } = driverData;
            drivers.push({ UID, name, Email, Mobile, car, assignment });
        });
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });
        response.render("Driver/viewDrivers.ejs", { drivers, documentNames });
    } catch (error) {
        console.error("Error fetching drivers:", error);
    }
});

/* Assign driver */
app.post("/driver/assignCollection", async function (request, response) {
    try {
        const { driverId, collection } = request.body;
        var assignmentDriver;
        const driverRef = db.collection("drivers").doc(driverId);

        // Get the current assignment of the driver
        const driverSnapshot = await driverRef.get();
        if (!driverSnapshot.exists) {
            response.status(404).send("Driver not found");
            return;
        }
        const driverData = driverSnapshot.data();
        const currentAssignment = driverData.assignment;

        if (collection !== "none") {
            const collectionDocRef = db.collection("collectionList").doc(collection);
            await collectionDocRef.update({ assignedTo: driverId });
        } else {
            if (currentAssignment === "none") {
                // If the driver is already assigned "none", do nothing
                alert("Driver is already not assigned any collection");
                response.redirect("/Driver/viewDrivers");
                return;
            }
            const collectionDocRef = db.collection("collectionList").doc(currentAssignment);
            await collectionDocRef.update({ assignedTo: "none" });
        }

        if (currentAssignment === collection) {
            alert("Driver is already assigned this collection");
            response.redirect("/Driver/viewDrivers");
            return;
        }

        await driverRef.update({ assignment: collection });
        alert("Done")
        response.redirect("/Driver/viewDrivers");
    } catch (error) {
        console.log(error);
        response.redirect("/Driver/viewDrivers");
    }
});


/* Romove a driver  */
app.post("/removeDriver", async function (request, response) {
    try {
        const email = request.body.email;
        const userRecord = await admin.auth().getUserByEmail(email);
        const uid = userRecord.uid;
        const querySnapshot = await db.collection("drivers").where("Email", "==", email).get();
        if (querySnapshot.empty) {
            alert("No driver found with email:" + email);
            response.redirect("/Driver/removeDriver");
            return;
        }

        const docId = querySnapshot.docs[0].id;
        await db.collection("drivers").doc(docId).delete();
        await admin.auth().deleteUser(uid);
        response.redirect("/Driver/viewDrivers");
        alert("Driver removed successfully");
    } catch (error) {
        response.redirect("/Driver/removeDriver");
        alert("Error removing driver: " + error.message);
    }
});



/*
DRIVER MANAGMENT END
*/






/*

COLLECTION MANAGMENT START

*/


/* Add collection page */
app.get("/Collections/addCollection", isAdmin, function (request, response) {
    response.render("Collections/addCollection.ejs");
});

app.post('/Collections/addCollection', async (request, response) => {
    try {
        const lat = Array.isArray(request.body['lat[]']) ? request.body['lat[]'] : [request.body['lat[]']];
        const lng = Array.isArray(request.body['lng[]']) ? request.body['lng[]'] : [request.body['lng[]']];
        const location = Array.isArray(request.body['location[]']) ? request.body['location[]'] : [request.body['location[]']];
        const mobile = Array.isArray(request.body['mobile[]']) ? request.body['mobile[]'] : [request.body['mobile[]']];
        const name = Array.isArray(request.body['name[]']) ? request.body['name[]'] : [request.body['name[]']];
        const order = Array.isArray(request.body['order[]']) ? request.body['order[]'] : [request.body['order[]']];
        const status = Array.isArray(request.body['status[]']) ? request.body['status[]'] : [request.body['status[]']];

        const newCollectionName = request.body.newCollectionName || 'default'; // Use 'default' if input is empty
        console.log(request.body.newCollectionName)
        const promises = [];
        for (let i = 0; i < lat.length; i++) {
            const collectionReferenec = await db.collection(newCollectionName).add({
                lat: lat[i],
                lng: lng[i],
                location: location[i],
                mobile: mobile[i],
                name: name[i],
                order: order[i] + "",
                status: status[i],
                deliveryTime: 0,
            });
            promises.push(collectionReferenec);
        }


        await Promise.all(promises);

        db.collection('collectionList').doc(newCollectionName).set({
            assignedTo: 'none',
            ready: 'yes'
        }).then(() => {
            console.log('New document added to collectionList with ID: ', newCollectionName);
        }).catch((error) => {
            console.error('Error adding document to collectionList: ', error);
        });

        response.redirect("/Collections/addCollection");
    } catch (error) {
        console.error('Error adding collections:', error);
    }
});

app.post('/Collections/addCollectionCSV', upload.single('csvFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const collectionName = req.file.originalname.split('.').slice(0, -1).join('');
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            results.forEach((row) => {
                const newDocRef = db.collection(collectionName).doc();
                newDocRef.set({
                    lat: parseFloat(row.Latitude),
                    lng: parseFloat(row.Longitude),
                    location: row.Location,
                    mobile: row.Mobile,
                    name: row.Name,
                    order: row.Order,
                    status: row.Status,
                    deliveryTime: row.deliveryTime
                }).then(() => {
                    console.log('Document successfully written with ID: ', newDocRef.id);
                }).catch((error) => {
                    console.error('Error writing document: ', error);
                });
            });
            fs.unlinkSync(req.file.path);

            // Add a new document in the collectionList collection with the file name
            db.collection('collectionList').doc(collectionName).set({
                assignedTo: 'none',
                ready: 'yes'
            }).then(() => {
                console.log('New document added to collectionList with ID: ', collectionName);
            }).catch((error) => {
                console.error('Error adding document to collectionList: ', error);
            });

            res.redirect("/Collections/addCollection");
        });
});





/* View collection page */
app.get("/Collections/viewCollection", isAdmin, async function (request, response) {
    try {
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });
        const defaultCollectionName = documentNames[0];
        const collectionSnapshot = await db.collection(defaultCollectionName).get();
        let collectionDetails = [];
        collectionSnapshot.forEach((doc) => {
            const data = doc.data();
            collectionDetails.push(data);
        });

        response.render("Collections/viewCollection.ejs", { documentNames: documentNames, collectionDetails: [] });

    } catch (error) {
        console.log(error);
    }
});
app.get("/Collections/ViewSpecificCollection", isAdmin, async function (request, response) {
    try {
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });

        const collectionNameSearch = request.query.collectionNameSearch;
        if (!collectionNameSearch || !documentNames.includes(collectionNameSearch)) {
            response.render("Collections/viewCollection.ejs", { documentNames: documentNames, collectionDetails: [] });
        } else {
            const collectionSnapshot = await db.collection(collectionNameSearch).get();
            let collectionDetails = [];
            collectionSnapshot.forEach((doc) => {
                const data = doc.data();
                collectionDetails.push(data);
            });

            response.render("Collections/viewCollection.ejs", { documentNames: [collectionNameSearch], collectionDetails: collectionDetails });
        }

    } catch (error) {
        console.log(error);
    }
});

/* Delete collection */
app.get("/Collections/removeCollection", isAdmin, async function (request, response) {
    try {
        const collections = await listCollections(db);
        response.render("Collections/removeCollection.ejs", { collections });
    } catch (error) {
        console.error("Error fetching collections:", error);
    }
});

app.post("/deleteCollection", checkNotAuthenticated, async function (request, response) {
    const collectionName = request.body.CollectionName;
    try {

        const driversSnapshot = await db.collection("drivers").where("assignment", "==", collectionName).get();
        const unassignPromises = [];
        driversSnapshot.forEach((doc) => {
            const driverRef = db.collection("drivers").doc(doc.id);
            unassignPromises.push(driverRef.update({ assignment: "none" }));
        });
        await Promise.all(unassignPromises);

        await db.collection("collectionList").doc(collectionName).delete();
        await deleteCollection(admin.firestore(), collectionName);

        alert("Collection removed ");
        response.redirect("/Collections/removeCollection");
    } catch (error) {
        alert("Error removing collection: " + error.message);
        response.redirect("/Collections/removeCollection");
    }
});



async function listCollections(db) {
    const collections = [];
    const collectionsRef = await db.listCollections();
    collectionsRef.forEach(collection => {
        collections.push(collection.id);
    });
    return collections;
}

async function deleteCollection(db, collectionPath) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__');
    await deleteQueryBatch(db, query);
}

async function deleteQueryBatch(db, query) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    process.nextTick(() => {
        deleteQueryBatch(db, query);
    });
}


app.post("/SignUp", async function (request, response) {
    try {
        connect();
        const exists = await User.exists({ email: request.body.email })
        if (exists) {
            response.redirect("/logIn");
            return;
        }

        const hashedPassword = await bcrypt.hash(request.body.password, 10)
        const newUser = new User({
            UserID: Date.now().toString(),
            email: request.body.email,
            password: hashedPassword,
            Phone_Number: request.body.Phone_Number,
            FName: request.body.FName,
            LName: request.body.LName,
            Country: request.body.Country,
            Address: request.body.Address,
            Postal_Code: request.body.Postal_Code,
            Admin: true, // signs up a new admin
        })
        newUser.save();

        response.redirect("/logIn")
    } catch {
        response.redirect("/SignUp")
    }
});

app.post("/logIn", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/logIn",
    failureFlash: true
}));


app.delete('/logout', (request, response) => {
    request.logOut(function (error) {
        if (error) {
            return next(error)
        }
        response.redirect('/')
    })
})
/*
COLLECTION MANAGMENT END
*/



/*

    TSP START

*/

app.get("/tsp", isAdmin, async function (request, response) {
    const result = "No results yet"

    try {
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });
        const defaultCollectionName = documentNames[0];
        const collectionSnapshot = await db.collection(defaultCollectionName).get();
        let collectionDetailsUnordered = [];
        collectionSnapshot.forEach((doc) => {
            const data = doc.data();
            collectionDetailsUnordered.push(data);
        });

        response.render("tsp.ejs", { documentNames, collectionDetailsUnordered: [], collectionDetailsOrdered: [], resultText: result });

    } catch (error) {
        console.log(error);
    }
});


app.get("/Collections/ViewSpecificCollectionTSP", isAdmin, async function (request, response) {
    const result = "No results yet..."
    try {
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });

        const collectionNameSearch = request.query.collectionNameSearch;
        if (!collectionNameSearch || !documentNames.includes(collectionNameSearch)) {
            response.render("tsp.ejs", { documentNames: documentNames, collectionDetailsUnordered: [], collectionDetailsOrdered: [], resultText: result });
        } else {
            const collectionSnapshot = await db.collection(collectionNameSearch).get();
            let collectionDetails = [];
            collectionSnapshot.forEach((doc) => {
                const data = doc.data();
                collectionDetails.push(data);
            });

            response.render("tsp.ejs", {
                documentNames: [collectionNameSearch], resultText: result,
                collectionDetailsUnordered: [], collectionDetailsOrdered: []
            });
        }

    } catch (error) {
        console.log(error);
    }
});

app.get("/tspCalculate", isAdmin, async function (request, response) {
    const result = "No results.";
    let listToCalculate = [[24.731695254145624, 46.77555817340259]];
    try {
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });

        const collectionNameSearch = request.query.collectionNameSearch;
        if (!collectionNameSearch || !documentNames.includes(collectionNameSearch)) {
            response.render("tsp.ejs", { documentNames: documentNames, collectionDetails: [],
                 collectionDetailsUnordered: [], collectionDetailsOrdered: [], resultText: result });
        } else {
            const collectionSnapshot = await db.collection(collectionNameSearch).get();
            let collectionDetails = [];
            collectionSnapshot.forEach((doc) => {
                const data = doc.data();
                collectionDetails.push(data);
                listToCalculate.push([data.lat, data.lng]);
            });

            const [allTimes, orderedLocations] = await runTSP(listToCalculate);

            // Update order fields in documents based on ordered locations
            await Promise.all(orderedLocations.slice(1).map(async (index, i) => {
                const docRef = await db.collection(collectionNameSearch)
                    .where('lat', '==', listToCalculate[index][0])
                    .where('lng', '==', listToCalculate[index][1])
                    .get();
                    if (!docRef.empty) {
                        const docId = docRef.docs[0].id;
                        const deliveryTime = allTimes[i + 1]; // Get the delivery time for this location
                        await db.collection(collectionNameSearch).doc(docId).update({ order: i + 1, deliveryTime: deliveryTime });
                    }
                }));

            const resultText = "Nodes in order:\n" + orderedLocations + "\nDelivery Times:\n" + allTimes;
            const collectionSnapshot2 = await db.collection(collectionNameSearch).get();
            let collectionDetails2 = [];
            collectionSnapshot2.forEach((doc) => {
                const data = doc.data();
                collectionDetails2.push(data);
            });

            response.render("tsp.ejs", {
                documentNames: [collectionNameSearch],
                resultText: resultText,
                collectionDetailsUnordered: collectionDetails,
                collectionDetailsOrdered: collectionDetails2
            });
        }

    } catch (error) {
        console.log(error);
    }
});

app.get("/vrp", isAdmin, async function (request, response) {
    const result = "No results yet";
    try {
        // Get document names
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });
        const defaultCollectionName = documentNames[0];

        // Get driver names
        const driversSnapshot = await db.collection("drivers").get();
        let driverNames = [];

        driversSnapshot.forEach((doc) => {
            driverNames.push(doc.data().name);
        });
        response.render("vrp.ejs", { documentNames, driverNames, resultText: result });

    } catch (error) {
        console.log(error);
    }
});


app.get("/vrpCalcualte", isAdmin, async function (request, response) {
    const result = "No results yet";
    try {

        const driversSnapshot = await db.collection("drivers").get();
        let driverNames = [];
        driversSnapshot.forEach((doc) => {
            driverNames.push(doc.data().name);
        });
        let selectedDrivers = request.query.selectedDriver || [];
        let selectedCollections = request.query.selectedCollection || [];

        if (!Array.isArray(selectedCollections)) {
            selectedCollections = [selectedCollections];
        }
        if (!Array.isArray(selectedDrivers)) {
            selectedDrivers = [selectedDrivers];
        }
        let houses = [];
        let allData = [];
        if (selectedDrivers.length > 0 && selectedCollections.length > 0) {
            houses.push(selectedDrivers.length)

            for (let collectionName of selectedCollections) {
                const collectionSnapshot = await db.collection(collectionName).get();
                collectionSnapshot.forEach((doc) => {
                    const { location, mobile, name, order, status } = doc.data();
                    const { lat, lng } = doc.data();
                    houses.push([lat, lng]);
                    allData.push([lat, lng, location, mobile, name, order, status]);
                });

            }

        }
        if (houses.length > 1) {
            for (let collectionName of selectedCollections) {
                await db.collection("collectionList").doc(collectionName).delete();
                await deleteCollection(admin.firestore(), collectionName);
            }
            let result_list;
            result_list = await runVRP(houses);
            var currentCollection = '';
            var previousCollection = '';
            console.log(selectedDrivers)
            result_list.forEach(async (item, index) => {
                if (typeof item === 'string' && item.startsWith('D')) {
                    if (previousCollection !== item) {
                        currentCollection = item; // Set current collection
                        previousCollection = item;
                    }
                    // Check if the index is within bounds and the next item doesn't start with 'D'
                    const nextItem = result_list[index + 1];
                    if (nextItem && (index === result_list.length - 1 || typeof nextItem !== 'string' || !nextItem.startsWith('D'))) {
                        await db.collection('collectionList').doc(item).set({
                            assignedTo: 'none',
                            ready: 'yes'
                        });
                    }
                } else if (Array.isArray(item) && currentCollection !== '') {
                    // Find matching coordinates in sussy array
                    var matchingData = allData.find(data => data[0] === item[0] && data[1] === item[1]);

                    // If matching data found, extract additional fields
                    if (matchingData) {
                        var [lat, lng, location, mobile, name, order, status] = matchingData;
                        db.collection(currentCollection).doc().set({
                            lat: lat,
                            lng: lng,
                            location: location,
                            mobile: mobile,
                            name: name,
                            order: order,
                            status: status
                        });
                    } else {
                        // If matching data not found, use default values
                        db.collection(currentCollection).doc().set({
                            lat: item[0],
                            lng: item[1],
                            location: "",
                            mobile: "",
                            name: "",
                            order: "0",
                            status: "pending"
                        });
                    }
                }
            });

            var driverIndex = 0
            for (let i = 0; i < result_list.length - 1; i++) {
                if (typeof result_list[i] === 'string' && result_list[i].startsWith('D')) {
                    if (typeof result_list[i + 1] !== 'string') {

                        const driverName = selectedDrivers[driverIndex];
                        const driverQuerySnapshot = await db.collection("drivers").where("name", "==", driverName).get();
                        if (!driverQuerySnapshot.empty) {
                            const driverDoc = driverQuerySnapshot.docs[0];
                            await driverDoc.ref.update({ assignment: result_list[i] });
                        } else {
                        }
                    }
                    driverIndex++; // Increment the index to move to the next driver in the copied array
                }
            }
        }
        const collectionListSnapshot = await db.collection("collectionList").get();
        let documentNames = [];
        collectionListSnapshot.forEach((doc) => {
            documentNames.push(doc.id);
        });
        response.render("vrp.ejs", { documentNames, driverNames, resultText: result });

    } catch (error) {
        console.log(error);
    }
});







function checkAuthenticated(request, response, next) {
    if (request.isAuthenticated()) {
        return response.redirect("/");
    }
    next();

}

function checkNotAuthenticated(request, response, next) {
    if (request.isAuthenticated()) {
        return next();
    }
    return response.redirect("/logIn");
}

function isAdmin(request, response, next) {
    if (request.isAuthenticated() && request.user.Admin === true) {
        return next()
    } else {
        return response.redirect("/");
    }
}
function noAdmin(request, response, next) {
    if (request.isAuthenticated() && request.user.Admin === true) {
        return response.redirect("/Admin");
    } else {
        return next();
    }
}
function runTSP(inputCollection) {
    return new Promise((resolve, reject) => {
        let outputData = '';
        const housesJSON = JSON.stringify(inputCollection);
        const pythonProcess = spawn('python', ['tsp.py']);

        pythonProcess.stdin.write(housesJSON);
        pythonProcess.stdin.end();

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            reject(data.toString());
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const output = JSON.parse(outputData);
                    const allTimes = output.allTimes;
                    const orderedLocations = output.orderedLocations;
                    resolve([allTimes, orderedLocations]);
                } catch (error) {
                    reject(error);
                }
            } else {
                reject(`Python process exited with code ${code}`);
            }
        });
    });
}



function runVRP(inputCollection) {
    return new Promise((resolve, reject) => {
        let outputData = '';
        const housesJSON = JSON.stringify(inputCollection);
        const pythonProcess = spawn('python', ['vrp.py']);

        pythonProcess.stdin.write(housesJSON);
        pythonProcess.stdin.end();

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            reject(data.toString());
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const output = JSON.parse(outputData);
                    resolve(output);
                } catch (error) {
                    reject(error);
                }
            } else {
                reject(`Python process exited with code ${code}`);
            }
        });
    });
}


const hostname = "127.0.0.1";
const port = 8000;
app.listen(port, hostname, function () {
    connect();

    console.log("Server Started on http://127.0.0.1:8000");
});







