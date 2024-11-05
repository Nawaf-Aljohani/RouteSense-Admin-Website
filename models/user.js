const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

const UserSchema = new Schema({

    //AutomIncrement ID to refrence the users'' bookings
    
    UserID:{

        type:String,
        required:true

    },

    FName:{

        type:String,
        required:true

    },
    LName:{

        type:String,
        required:true

    },
    Phone_Number:{

        type:String,
        required:true

    },
    email:{

        type:String,
        required:true

    },
    Country:{

        type:String,
        required:true

    },
    Address:{

        type:String,
        required:true

    },
    Postal_Code:{

        type:String,
        required:true

    },
    password:{

        type:String,
        required:true

    },
    Admin: {
        type: Boolean,
        default: false
    }


});

const User = mongoose.model('User',UserSchema);
module.exports = User;