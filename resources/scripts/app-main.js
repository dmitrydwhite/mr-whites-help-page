'use strict';

function AppExecute(firebase) {
  // Set page ref for which classroom we're in.
  var classroomRef = '';
  var isInstructor = false;
  // Set refs for the Firebase DB lists.
  var tickets = firebase.database().ref('/tickets/');
  var fixedTickets = firebase.database().ref('/resolved/');
  var allClasses = firebase.database().ref('/classrooms/');
  // Set a global Ref for the tickets.
  var tixRef;
  
  function selectClassroom(classrooms = []) {
    const rooms = [];

    classrooms.forEach((room) => {
      rooms.push(room.exportVal());
    });

    const roomMarkup = rooms.reduce((mk, room) => `
      ${mk}<button class="room-button" data-code="${room.code}">${room.display}</button>
    `, '');

    document.getElementsByClassName('room-select')[0].innerHTML = `<hr>${roomMarkup}<hr>`;

    const allButtons = document.querySelectorAll('button.room-button');

    if (rooms.length === 1) {
      allButtons[0].classList.add('room-selected');
      classroomRef = rooms[0].code;
    } else {
      [...document.querySelectorAll('button.room-button')].forEach(btn => {
        btn.addEventListener('click', (evt) => {
          allButtons.forEach(btn => btn.classList.remove('room-selected'));
          evt.currentTarget.classList.add('room-selected');
          classroomRef = evt.currentTarget.getAttribute('data-code');
          displayUnresolvedTickets(tixRef);
        });
      });
    }
  }

  function showHintsWhileWaiting(on) {
    const form = document.getElementById('help-form');
    const slidesAreThere = document.getElementById('slide-wrapper');
    
    if (on && !slidesAreThere) {
      const wrapperDiv = document.createElement('div');
      const slideFrame = document.createElement('iframe');
      const newFrameAttrs =  {
        src: 'https://docs.google.com/presentation/d/e/2PACX-1vRRKbyGTjjPfIj41Yn4Xo3p_sDZzRIHvFaOmJnPHXjIZJhNL5-FrXx8Vhu3hxprVbUaUwKjD_WngMS3/embed?start=true&loop=true&delayms=10000',
        frameborder: '0',
        width: '960',
        height: '569',
        allowfullscreen: 'true',
        mozallowfullscreen: 'true',
        webkitallowfullscreen: 'true',
      };

      wrapperDiv.id = 'slide-wrapper';
      Object.keys(newFrameAttrs).forEach(key => {
        slideFrame[key] = newFrameAttrs[key];
      });
      form.hidden = true;
      wrapperDiv.appendChild(slideFrame);
      form.after(wrapperDiv);
    } else if (!on) {
      const slideDiv = document.getElementById('slide-wrapper');

      if (slideDiv) slideDiv.remove();
      form.hidden = false;
    }
  }

  /**
   * Gathers User info from form, of which there is only one on the page, and submits it to the Firebase DB.
   */
  function addTicket(evt) {
    const form = evt.currentTarget;
    const inputs = form.getElementsByTagName('input');
    const userRef = firebase.auth().currentUser;
    const ticketData = {
      name: form.getElementsByClassName('your-name')[0].value,
      problem: form.getElementsByClassName('your-problem')[0].value,
      submitTime: Date.now(),
      resolved: false,
      creatorUid: (userRef && userRef.uid),
      room: classroomRef,
    };

    // Name and Problem Description are required.
    if (ticketData.name && ticketData.problem && ticketData.creatorUid) {
      // Push to Firebase DB
      tickets.push(ticketData);
      // Clear out the inputs on successful submit
      [...inputs].forEach(input => ['value', 'placeholder'].forEach(prop => input[prop] = ''));
    } else {
      // Put a warning as placeholder in the inputs
      [...inputs].forEach(input => {
        input.placeholder = `⚠️ ${input.getAttribute('name')} field required`;
      });
    }
  }

  /**
   * Removes the ticket from the active queue.  Click handler for clicking a "Problem Solved" button.
   * @param {Event} evt The click event on the "Problem Solved" button.
   */
  function removeFromActive(evt) {
    tickets.database.ref(`/tickets/${evt.currentTarget.getAttribute('data-id')}`).remove();
  }

  /**
   * Sets a ticket's resolved value to "true", and pushes it to the fixed tickets list in Firebase DB.
   * Callback for on.child_removed.
   * @param {Firebase} resolved The Firebase dataset from the change handler.
   */
  function resolveTicket(resolved) {
    const resolvedTicket = resolved.exportVal();

    resolvedTicket.resolved = true;
    fixedTickets.push(resolvedTicket);
  }

  /**
   * Builds a markup display for each ticket in the dataset from Firebase DB.
   * Callback for on.value.
   * @param {Firebase} tix Firebase list of tickets in the "tickets" path.
   */
  function displayUnresolvedTickets(tix) {
    const userRef = firebase.auth().currentUser;
    const currentUser = (userRef && userRef.uid) || 'anonymous';
    let markup = '';
    let currentUserHasTicket;

    // Update the page's knowledge of all the tickets, even the ones not for our class.
    tixRef = tix;

    // Iterate through the list and increase the markup.
    tix.forEach(function(ticket) {
      const val = ticket.exportVal();
      const disableTicket = (currentUser !== val.creatorUid && !isInstructor) ? 'disabled' : '';

      if (currentUser === val.creatorUid) currentUserHasTicket = true;

      markup += val && !val.resolved && val.room === classroomRef ? `
        <div class="unresolved-ticket" data-ticket-id="${val.submitTime}">
          <p>Help Requested</p>
          <p>${val.name} needs help: ${val.problem}</p>
          <button
            class="fixed"
            data-id="${ticket.key}"
            ${disableTicket}
          >Problem Solved</button>
        </div>
      ` : '';
    });
    
    // Grab the empty div once and put all the generated markup in there.
    document.getElementById('waiting-tickets').innerHTML = markup;
    // Add click handlers on all the ticket buttons.
    [...document.getElementsByClassName('fixed')].forEach(btn => btn.addEventListener('click', removeFromActive));
    // Show the slide show if this user has a waiting ticket and the markup exists.
    if (currentUserHasTicket && markup.length !== 0) showHintsWhileWaiting(true);
    else showHintsWhileWaiting(false);
  }

  /**
   * Starts the app/page's interactions with the databases. Expects a user to be logged in.
   */
  function startApp() {
    // See if this user is an instructor.
    isUser = firebase.auth().currentUser && firebase.auth().currentUser.uid === 'KMuMoYvOnyWlVmikiTCmQnV7EN83';

    // Run the function that adds the classroom selection buttons to the page.
    allClasses.once('value', selectClassroom);

    // Set listeners on the two `tickets` events we're working with: value and child_removed.
    tickets.on('child_removed', resolveTicket);
    tickets.on('value', displayUnresolvedTickets);

    // Set listeners on the markup elements that we will need to interact with.
    document.getElementById('help-form').addEventListener('submit', addTicket);
  }

  // Check the user state
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
      firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .then(startApp);
    } else {
      startApp();
    }
  });
}

AppExecute(firebase);