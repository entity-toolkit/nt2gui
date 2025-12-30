# Description
- This is a scientific visualization app which has two components: a backend server, and a frontend UI 
- The backend is written in Python with Flask and handles the data analysis and post-processing, and UI persistency.
- The frontend is a react-based vite app written in typescript which uses flex-layout for to display multiple panels with selectable plots.
- The UI state should be synchronized with the server which must keep track of it and potentially recover at initialization.

# Guidelines
- Use both react typescript and Python best-practices.
- Run `pip install -r requirements` to install python requirements and use `npm i` to install node requirements.
- use `npm run dev` to run both the server and the client concurrently.
- The state of UI must be fully reproducible and synchronized with the server.
- Run tests with `npm run test`, in the most error-prone routines -- always add unit tests.
