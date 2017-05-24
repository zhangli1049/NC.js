# NC.js


### Setting up a development environment

  1. Download NC.js:

  ```
  > git clone https://github.com/steptools/NC.js.git
  > cd NC.js
  ```

  ------------------------------------------------------------------------------
  2. Setting up which model to use

  In config.js put the path of the .stpnc file you want to use in the file object
  under the dir key
 
  ```
  "file" : {"dir": "path_to_.stpnc_file"} 
  ```
 ------------------------------------------------------------------------------
  3. Install Glyphicons

  ```
  > cd src/client
  > cp ~Downloads/fonts ./fonts
  ```

  ------------------------------------------------------------------------------
  4. Install nodejs packages

  ```
  > npm install
  ```
 ------------------------------------------------------------------------------
  5. Making a server

  Making a server will build and then start the server

  ```
  > npm run make
  ```

  or, to minimize the file sizes

  ```
  > npm run make-release
  ```
  ------------------------------------------------------------------------------
  6. Start a server

  If a server doesn't need to be rebuilt, this will be faster than making everytime. 

  ```
  > npm start
  ```

  or to use a specific model and overload the config.js
  
   ```
  > npm start -- -f "path_to_.stpnc_file"
  ```
  ------------------------------------------------------------------------------
  7. Open Client
  
  With the server running, point a web browser to
  
  ```
  http://localhost:8080/
  ```
