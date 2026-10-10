//export default {
  //server: {
    //proxy: {
      //'/api': 'http://localhost:5000'
    //}
  //}
//};

export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  }
};