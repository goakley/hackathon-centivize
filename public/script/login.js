navigator.id.watch({
    onlogin: function(assertion) {
        console.log("I AM NOW LOGGING IN");
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/persona/verify", true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.addEventListener("loadend", function(e) {
            var data = JSON.parse(this.responseText);
            if (data && data.status === "okay") {
                console.log("You have been logged in as: " + data.email);
            }
        }, false);
        
        xhr.send(JSON.stringify({
            assertion: assertion
        }));
        location.reload();
    },
    onlogout: function() {
        console.log("I AM NOW LOGGING OUT");
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/persona/logout", true);
        xhr.addEventListener("loadend", function(e) {
            console.log("You have been logged out");
        });
        xhr.send();
    }
});
