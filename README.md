# RouteSense-Admin-Website
My graduate senior project, an admin website to manage a driver application and database.
<br>
The main objective of this project is to implement the Vehicle Routing Problem (VRP) effieciently as the goal is to find optimal routes for multiple vehicles visiting a set of locations as well as TSP.




## Getting Started
1. [Node.js](https://nodejs.org/en) required
2. Run npm install to download dependencies
3. Add [MongoDB](https://www.mongodb.com/) connection string, secret phrase, [Firebase](https://firebase.google.com/) adminSDK in .env <br>
   ![image](https://github.com/user-attachments/assets/1b7ec346-3312-4a13-8313-6affdafd64aa)
   
5. Must add [Firebase](https://firebase.google.com/) connection
6. VRP and TSP files are confidential so their perspective functions are disabled
7. 
8. Use the an admin email to log in and sign up other admins
9. Run node server


## Features
- Secure Sign up/Log in
- Customer Pages
  - Home: Includes media images of the application
  - About: includes company statement
  - Careers: email to receive CVs
  - Customer Support: Number and email for customers
- Admin Pages
  - Dashboard: Shows faux information regarding deliveries
  - Add Drivers: Ability to add new drivers to the app
  - Driver Managment: Ability to manage drivers and see their information
  - Add Collections: Ability to add new routes using CSV file or manually
  - Remove Collections: Ability to remove collections
  - View Collections: Ability to view collections
  - TSP Page: Calculates best order for a collection
  - VRP Page: Calculates best route for multiple collections and assigns drivers
