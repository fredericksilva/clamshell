/**
 * @jsx React.DOM
 */

/*
== BSD2 LICENSE ==
Copyright (c) 2014, Tidepool Project

This program is free software; you can redistribute it and/or modify it under
the terms of the associated License, which is identical to the BSD 2-Clause
License as published by the Open Source Initiative at opensource.org.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the License for more details.

You should have received a copy of the License along with this program; if
not, you can obtain one from Tidepool Project at tidepool.org.
== BSD2 LICENSE ==
*/

'use strict';

var _ = require('lodash');

module.exports = function(component,app) {
  /**
   * Delete the users session and set app state to be logged out
   */
  component.handleLogout =function(){
    app.trackMetric('Logged Out');
    app.log('logging out');
    app.api.user.logout(function(error,success){
      if(error){
        component.handleError(error);
      }
      component.setState({
        routeName: app.routes.login,
        authenticated: false,
        showingMenu: false
      });
      return;
    }.bind(this));
  };

  /**
   * Set app state to handle the back command
   */
  component.handleBack =function(){
    app.trackMetric('Clicked Back');
    var previousRoute = component.state.previousRoute;
    var currentRoute = component.state.routeName;

    if(!previousRoute || previousRoute === currentRoute){

      previousRoute = app.routes.messagesForAllTeams;
    }
    component.setState({routeName:previousRoute});
  };

  component.handleOpenMenu = function() {
    app.trackMetric('Opened Menu');
    // Don't try to render if nothing to show
    if (!component.state.loggedInUser) {
      return;
    }
    component.setState({showingMenu:true});
  };

  component.handleCloseMenu = function() {
    app.trackMetric('Closed Menu');
    component.setState({showingMenu:false});
  };

  function stringifyError(errorObject){

    var details;

    if(_.isPlainObject(errorObject)){
      details = JSON.stringify(errorObject);
    } else {
      details = errorObject.toString();
    }
    return details;
  }

  /**
   * Basic handler when an error has occured, we just show the message
   *
   * @param {Error} error - The error that has occured to be shown.
   */
  component.handleError =function(error){

    var status = error.status ||  'unknown';

    error = stringifyError(error);

    var info = {
      message : app.userMessages.PLATFORM_ERROR,
      details : error,
      type : 'error'
    };

    //default will refresh
    var stateOnClosing = {
      loggedInUser : app.api.user.get()
    };

    if (status === 401) {
      //go to login
      info.message = app.userMessages.AUTH_ERROR;
      info.type = 'alert';
      //its a 401 - the error adds no detail in this case
      info.details = null;

      app.log(info.message);
      app.api.errors.log(error,info.message);

      //set what we want the state to be on close
      stateOnClosing = { routeName: app.routes.login, authenticated: false, showingMenu: false };

      component.setState({
        notification : { info: info, stateOnClosing : stateOnClosing }
      });
      return;
    }

    if (status === 500) {
      app.api.errors.log(error,info.message);
      app.log(info.message);

      component.setState({
        notification : { info: info, stateOnClosing : stateOnClosing }
      });

      return;
    }

    app.api.log(error,info.message);

    component.setState({
      notification : { info: info, stateOnClosing : stateOnClosing }
    });

    return;
  };

  /**
   * Basic handler when a message needs to be shown to the user
   *
   * @param {Object} info
   * @param {String} info.message the user friendly message
   * @param {String} info.type the type of notification
   * @param {String} info.details optionals error details used in screen shots
   * @param {Object} stateOnClosing contains state settings that will be applied when notification is closed
   */
  component.handleNotification =function(info, stateOnClosing){

    component.setState({
      notification : { info: info, stateOnClosing : stateOnClosing }
    });
  };

  /**
   * Clears the notification and sets any state that is given
   *
   * @param {Object} stateOnClosing
   */
  component.handleNotificationDismissed = function(stateOnClosing){

    stateOnClosing = stateOnClosing || {};
    stateOnClosing.notification = null;

    component.setState(stateOnClosing);
  };

  /**
   * Trigger load of user data on successful login
   */
  component.handleLoginSuccess = function(){
    app.trackMetric('Logged In');
    component.setState({ authenticated : true });
    component.loadUserData();
  };

  /**
   * Load a message thread from the platform
   *
   * @param {Message} mostRecentMessageInThread - The most recent message in a thread
   */
  component.handleShowConversationThread = function(mostRecentMessageInThread){
    app.trackMetric('Viewed Note Thread');
    var messagesId = mostRecentMessageInThread.id;

    if(mostRecentMessageInThread.parentmessage){
      messagesId = mostRecentMessageInThread.parentmessage;
    }

    app.api.notes.getThread(messagesId,function(error,thread){

      if(error){
        return component.handleError(error);
      }

      var userToDisplay = app.dataHelper.getSelectedUser(
        mostRecentMessageInThread.groupid,
        component.state.loggedInUser
      );

      component.setState({
        selectedThread : thread,
        routeName : app.routes.messageThread,
        selectedUser : userToDisplay,
        previousRoute : component.state.routeName
      });
    });
  };

  /**
   * Show this message and make editable
   *
   * @param {Message} toEdit - the message to edit
   */
  component.handleShowForEdit = function(toEdit){
    app.trackMetric('Selected For Edit');

    component.setState({
      selectedForEdit : toEdit,
      routeName : app.routes.messageThread
    });
  };

  /**
   * Save the edited message
   *
   * @param {Message} edited - the edited message
   */
  component.handleSaveEdit = function(edited){
    app.trackMetric('Edit To Save');

    app.api.notes.edit(edited,function(error){
      app.log('edit made');
      if(error){
        return component.handleError(error);
      }
    });
  };

  /**
   * Save the given message to the platform
   *
   * @param {Object} note - The root message text of this thread
   */
  component.handleStartConversation = function(note){
    app.trackMetric('Added Note');
    var message = app.dataHelper.createMessage(
      note.text,
      note.timestamp,
      component.state.loggedInUser,
      component.state.selectedUser.userid
    );

    app.api.notes.add(message,function(error,addedNote){
      app.log('thread started');
      if(error){
        return component.handleError(error);
      }
      var userToUpdate = component.state.selectedUser;
      userToUpdate.notes.unshift(addedNote);
      component.setState({
        selectedUser: userToUpdate,
        lastNoteAdded: addedNote
      });
    }.bind(this));
  };

  /**
   * Add a comment to an existing thread
   *
   * @param {Object} note - A comment on the thread
   */
  component.handleAddingToConversation = function(note){
    app.trackMetric('Added Comment');
    var thread = component.state.selectedThread;
    var parentId = app.dataHelper.getParentMessageId(thread);

    //we set the parentId here
    var comment = app.dataHelper.createMessage(
      note.text,
      note.timestamp,
      component.state.loggedInUser,
      component.state.selectedUser.userid,
      parentId
    );

    app.api.notes.reply(comment,function(error, addedComment){
      app.log('reply added');
      if(error){
        return component.handleError(error);
      }
      thread.push(addedComment);
      component.setState({
        selectedThread: thread,
        lastCommentAdded: addedComment
      });
    }.bind(this));

  };

  /**
   * Change which user is being displayed
   *
   * @param {Object} selectedUser - the user that has been selected
   */
  component.handleUserChanged = function(selectedUserId){
    app.trackMetric('Changed Selected User');
    var userToDisplay = app.dataHelper.getSelectedUser(
      selectedUserId,
      component.state.loggedInUser
    );

    component.setState({
      routeName : app.routes.messagesForSelectedTeam,
      selectedUser : userToDisplay,
      previousRoute : component.state.routeName,
      showingMenu : false
    });
  };
};
