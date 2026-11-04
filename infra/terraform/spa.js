function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf('/api/') === 0) return request;
  if (uri === '/' || uri.indexOf('.', uri.lastIndexOf('/') + 1) === -1) {
    request.uri = '/index.html';
  }
  return request;
}
