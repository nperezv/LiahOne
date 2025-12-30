declare module "cmdk" {
  import * as React from "react";

  type CommandComponent = React.ForwardRefExoticComponent<any> & {
    Input: React.ForwardRefExoticComponent<any>;
    List: React.ForwardRefExoticComponent<any>;
    Empty: React.ForwardRefExoticComponent<any>;
    Group: React.ForwardRefExoticComponent<any>;
    Separator: React.ForwardRefExoticComponent<any>;
    Item: React.ForwardRefExoticComponent<any>;
  };

  export const Command: CommandComponent;
}
