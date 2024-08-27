const express = require("express");
const router = express.Router();

// Route handler for rendering the delivery page with purchases and descriptions
router.get("/", (req, res, next) => {
  const contractNumberSelect =
    "SELECT DISTINCT ContractNumber FROM tblTransactionHistory ORDER BY ContractNumber DESC;";

  // Fetch purchases
  global.db.all(contractNumberSelect, (err, contractNumbers) => {
    if (err) {
      next(err);
      return;
    }

    // Render HTML using EJS template with purchases and descriptions passed to it
    res.render("return", {
      contractNumbers: contractNumbers,
    });
  });
});

// Route handler for fetching purchases based on contract number
router.get("/transactions/:contractNumber", (req, res, next) => {
  const contractNumber = req.params.contractNumber;
  const purchaseQuery ="  SELECT th.ID, th.ContractNumber, th.Panel, th.Description, th.Height, th.Width, th.Length AS LengthPerPiece, th.Length * th.Qty AS TotalOriginalLength, th.Qty, th.Draw, th.Return, th.DateOfTransaction, th.DrawnFrom, (th.Length * th.Qty) - COALESCE(SUM(r.Length * r.QtyReturnedStatic), 0) AS TotalCorrectedLength FROM tblTransactionHistory th LEFT JOIN tblReturns r ON th.ID = r.TransactionID WHERE th.ContractNumber = ? AND th.Draw = 1 GROUP BY th.ID, th.ContractNumber, th.Panel, th.Description, th.Height, th.Width, th.Length, th.Qty, th.Draw, th.Return, th.DateOfTransaction, th.DrawnFrom;";




  //SELECT th.ID, th.ContractNumber, th.Panel, th.Description, th.Height, th.Width, th.Length AS LengthPerPiece, th.Length * th.Qty AS TotalOriginalLength, th.Qty, th.Draw, th.Return, th.DateOfTransaction, th.DrawnFrom, COALESCE(th.Length * th.Qty - SUM(r.Length), th.Length * th.Qty) AS TotalCorrectedLength FROM tblTransactionHistory th LEFT JOIN tblReturns r ON th.ID = r.TransactionID WHERE th.ContractNumber = ? AND Draw=1 GROUP BY th.ID, th.ContractNumber, th.Panel, th.Description, th.Height, th.Width, th.Length, th.Qty, th.Draw, th.Return, th.DateOfTransaction, th.DrawnFrom;
    
  
  // "SELECT * FROM tblTransactionHistory WHERE ContractNumber = ? AND Draw = 1";

  // Fetch purchases for the specified contract number
  global.db.all(purchaseQuery, [contractNumber], (err, purchases) => {
    if (err) {
      next(err);
      return;
    }

    // Send the fetched purchases as JSON response
    res.json(purchases);
    // console.log(purchases);
  });
});

router.get("/id/:selectedValue", (req, res, next) => {
  const id = req.params.selectedValue;
  const purchaseQuery =
    "SELECT * FROM tblTransactionHistory WHERE ID = ? AND Draw = 1";

  // Fetch purchases for the specified contract number
  global.db.all(purchaseQuery, [id], (err, row) => {
    if (err) {
      next(err);
      return;
    }

    // Send the fetched purchases as JSON response
    res.json(row);
  });
});

router.post("/insertReturnTransaction", (req, res, next) => {
  const { sendingData } = req.body;
  const currentDate = new Date().toLocaleDateString();
  console.log(sendingData[0]);

  // Prepare the SQL queries
  const query1 =
    "INSERT INTO tblTransactionHistory (ContractNumber, Panel, Description, Height, Width, Length, Qty, Return, DateOfTransaction) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)";
  const query2 =
    "INSERT INTO tblReturns (TransactionID,ContractNumber,Description, Height, Width, Length, QtyReturned,QtyReturnedStatic, DateReturned) VALUES (?,?, ?, ?, ?, ?, ?, ?,?)";

  // Array to store any errors that occur during insertion
  const insertionErrors = [];

  // Loop through sendingData and insert/update records
  sendingData.forEach(
    ({
      id,
      contractNumber,
      returnType,
      panelNumber,
      description,
      height,
      width,
      length,
      qty,
    }) => {
      // Validate the data before insertion
      if (
        id&&
        contractNumber &&
        returnType&&
        panelNumber &&
        description &&
        height &&
        width &&
        length &&
        qty
      ) {
        const values1 = [
          contractNumber,
          panelNumber,
          description,
          height,
          width,
          length,
          qty,
          currentDate,
        ];
        const values2 = [id,returnType,description, height, width, length, qty,qty,  currentDate];

        // Execute the SQL queries
        global.db.run(query1, values1, function (err) {
          if (err) {
            insertionErrors.push(err.message);
            console.error(
              "Error inserting data into tblTransactionHistory:",
              err.message
            );
          }
        });

        global.db.run(query2, values2, function (err) {
          if (err) {
            insertionErrors.push(err.message);
            console.error(
              "Error updating tblReturns:",
              err.message
            );
          }
        });
      } else {
        insertionErrors.push("Missing data for insertion");
        console.error("Missing data for insertion");
      }
    }
  );

  // Send response based on insertion status
  if (insertionErrors.length > 0) {
    console.error("Insertion errors:", insertionErrors);
    res
      .status(500)
      .json({ error: "Error inserting data", details: insertionErrors });
  } else {
    res.json({
      message:
        "Data inserted successfully into tblTransactionHistory and tblStock",
    });
  }
});

module.exports = router;
